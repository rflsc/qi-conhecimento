import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { PinoLogger } from 'nestjs-pino';
import {
  DocumentSourceType,
  IngestionStatus,
  WebImportJobStatus,
  WebImportPageStatus,
} from '@qi-conhecimento/shared-types';
import { DomainEvents } from '@events/domain-events';
import { JOB_NAMES, QUEUE_NAMES } from '@queues/queues.constants';
import { KnowledgeRepository } from '@modules/knowledge/repositories/knowledge.repository';
import { CreateWebImportJobDto } from '../dtos/web-import.dto';
import { UpdateWebImportSettingsDto } from '../dtos/web-import-settings.dto';
import { mapWebImportJob, mapWebImportPage } from '../interfaces/web-import.mapper';
import { WebImportRepository } from '../repositories/web-import.repository';
import { WebDiscoveryService } from './web-discovery.service';
import { WebImportProgressService } from './web-import-progress.service';
import { WebImportSettingsService } from './web-import-settings.service';
import { titleFromUrl } from '../utils/url.util';

@Injectable()
export class WebImportService {
  constructor(
    private readonly repository: WebImportRepository,
    private readonly discoveryService: WebDiscoveryService,
    private readonly progressService: WebImportProgressService,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly settingsService: WebImportSettingsService,
    private readonly logger: PinoLogger,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.WEB_IMPORT) private readonly webImportQueue: Queue,
    @InjectQueue(QUEUE_NAMES.INGESTION) private readonly ingestionQueue: Queue,
  ) {
    this.logger.setContext(WebImportService.name);
  }

  async createJob(dto: CreateWebImportJobDto) {
    const settings = await this.settingsService.getSettings();

    const job = await this.repository.createJob({
      title: dto.title,
      specialty: dto.specialty,
      normReference: dto.normReference,
      author: dto.author,
      config: {
        seedUrl: dto.config.seedUrl,
        discovery: dto.config.discovery,
        profileId: dto.config.profileId,
        maxPages: dto.config.maxPages ?? settings.maxPages,
        maxDepth: dto.config.maxDepth ?? settings.maxDepth,
        sameOriginOnly: dto.config.sameOriginOnly ?? true,
        pathPrefix: dto.config.pathPrefix,
        tags: dto.config.tags ?? [],
        rateLimitMs: settings.rateLimitMs,
      },
      status: WebImportJobStatus.PENDING,
      pagesDiscovered: 0,
      pagesCompleted: 0,
      pagesFailed: 0,
      pagesSkipped: 0,
      deletedAt: null,
    });

    this.progressService.init(job._id.toString());

    try {
      await this.webImportQueue.add(JOB_NAMES.RUN_WEB_IMPORT, { jobId: job._id.toString() });
    } catch {
      throw new ServiceUnavailableException(
        'Redis indisponível — não foi possível enfileirar a importação web',
      );
    }

    return mapWebImportJob(job);
  }

  async listJobs(page: number, limit: number) {
    const [jobs, total] = await this.repository.findJobs(page, limit);
    return {
      data: jobs.map(mapWebImportJob),
      total,
      page,
      limit,
    };
  }

  async getJob(jobId: string) {
    const job = await this.repository.findJobById(jobId);
    if (!job) throw new NotFoundException('Job de importação não encontrado');
    return mapWebImportJob(job);
  }

  getSettings() {
    return this.settingsService.getSettings();
  }

  updateSettings(dto: UpdateWebImportSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  async listPages(jobId: string, page: number, limit: number, status?: WebImportPageStatus) {
    const job = await this.repository.findJobById(jobId);
    if (!job) throw new NotFoundException('Job de importação não encontrado');

    const [pages, total] = await this.repository.findPages(jobId, page, limit, status);
    return {
      data: pages.map(mapWebImportPage),
      total,
      page,
      limit,
    };
  }

  getProgress(jobId: string) {
    return this.progressService.getSnapshot(jobId);
  }

  streamProgress(jobId: string, res: Response): void {
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;

    const cleanup = () => {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    };

    res.on('close', cleanup);

    void this.repository
      .findJobById(jobId)
      .then((job) => {
        if (!job) {
          if (!closed && !res.headersSent) {
            res.status(404).json({ message: 'Job de importação não encontrado' });
          }
          return;
        }

        if (closed) return;

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const snapshot = this.progressService.getSnapshot(jobId);
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

        unsubscribe = this.progressService.subscribe(jobId, (progress) => {
          if (closed) return;
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
        });

        heartbeat = setInterval(() => {
          if (closed) return;
          const current = this.progressService.getSnapshot(jobId);
          res.write(`data: ${JSON.stringify(current)}\n\n`);
        }, 5_000);
      })
      .catch(() => {
        if (!closed && !res.headersSent) {
          res.status(404).json({ message: 'Job de importação não encontrado' });
        } else {
          cleanup();
        }
      });
  }

  async cancelJob(jobId: string) {
    const job = await this.repository.findJobById(jobId);
    if (!job) throw new NotFoundException('Job de importação não encontrado');
    if (job.status === WebImportJobStatus.CANCELLED) {
      throw new BadRequestException('Job já está cancelado');
    }

    await this.repository.updateJob(jobId, { status: WebImportJobStatus.CANCELLED });
    await this.removeQueuedJobs(jobId);
    this.progressService.setPhase(
      jobId,
      'cancelled',
      'Importação cancelada',
      WebImportJobStatus.CANCELLED,
    );

    return mapWebImportJob((await this.repository.findJobById(jobId))!);
  }

  async retryFailed(jobId: string) {
    const job = await this.repository.findJobById(jobId);
    if (!job) throw new NotFoundException('Job de importação não encontrado');

    const failedPages = await this.repository.findPagesByJobAndStatuses(jobId, [
      WebImportPageStatus.FAILED,
    ]);
    if (failedPages.length === 0) {
      throw new BadRequestException('Nenhuma página com falha para reprocessar');
    }

    for (const page of failedPages) {
      await this.repository.updatePage(page._id.toString(), {
        status: WebImportPageStatus.PENDING,
        error: undefined,
        documentId: undefined,
      });
    }

    await this.repository.updateJob(jobId, {
      status: WebImportJobStatus.IMPORTING,
      error: undefined,
    });

    await this.enqueuePages(jobId, failedPages.map((page) => page._id.toString()), job.config.rateLimitMs);

    this.progressService.update(jobId, {
      phase: 'importing',
      status: WebImportJobStatus.IMPORTING,
      message: `Reprocessando ${failedPages.length} página(s) com falha`,
    });

    return mapWebImportJob((await this.repository.findJobById(jobId))!);
  }

  async runImport(jobId: string): Promise<void> {
    const job = await this.repository.findJobById(jobId);
    if (!job || job.status === WebImportJobStatus.CANCELLED) return;

    await this.repository.updateJob(jobId, {
      status: WebImportJobStatus.DISCOVERING,
      error: undefined,
    });
    this.progressService.setPhase(
      jobId,
      'discovering',
      'Descobrindo URLs…',
      WebImportJobStatus.DISCOVERING,
    );

    try {
      const discovered = await this.discoveryService.discover(job.config.discovery, {
        seedUrl: job.config.seedUrl,
        maxPages: job.config.maxPages,
        maxDepth: job.config.maxDepth,
        sameOriginOnly: job.config.sameOriginOnly,
        pathPrefix: job.config.pathPrefix,
      });

      if (discovered.length === 0) {
        throw new Error('Nenhuma URL encontrada para importação');
      }

      const unique = new Map<string, { url: string; title?: string }>();
      for (const page of discovered) {
        unique.set(page.url, page);
      }

      let pages;
      try {
        pages = await this.repository.createPages(jobId, [...unique.values()]);
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code !== 11000) throw error;
        pages = await this.repository.findPagesByJobAndStatuses(jobId, [WebImportPageStatus.PENDING]);
      }

      const refreshed = await this.repository.refreshJobCounters(jobId);
      await this.repository.updateJob(jobId, { status: WebImportJobStatus.IMPORTING });

      this.progressService.update(jobId, {
        phase: 'importing',
        status: WebImportJobStatus.IMPORTING,
        pagesDiscovered: refreshed?.pagesDiscovered ?? pages.length,
        pagesCompleted: refreshed?.pagesCompleted ?? 0,
        pagesFailed: refreshed?.pagesFailed ?? 0,
        pagesSkipped: refreshed?.pagesSkipped ?? 0,
        message: `Importando ${pages.length} página(s)…`,
      });

      await this.enqueuePages(
        jobId,
        pages.map((page) => page._id.toString()),
        job.config.rateLimitMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha na descoberta de URLs';
      await this.repository.updateJob(jobId, { status: WebImportJobStatus.FAILED, error: message });
      this.progressService.setPhase(jobId, 'failed', message, WebImportJobStatus.FAILED);
      this.logger.error({ jobId, error: message }, 'Falha no job de importação web');
    }
  }

  async processPage(pageId: string): Promise<void> {
    const page = await this.repository.findPageById(pageId);
    if (!page) return;

    const jobId = page.jobId.toString();
    const job = await this.repository.findJobById(jobId);
    if (!job || job.status === WebImportJobStatus.CANCELLED) {
      await this.repository.updatePage(pageId, { status: WebImportPageStatus.SKIPPED });
      await this.finalizeJobIfDone(jobId);
      return;
    }

    await this.repository.updatePage(pageId, { status: WebImportPageStatus.FETCHING });
    this.progressService.update(jobId, {
      currentUrl: page.url,
      message: `Enfileirando ${page.url}`,
    });

    try {
      const document = await this.knowledgeRepository.createDocument({
        title: page.title?.trim() || titleFromUrl(page.url),
        specialty: job.specialty,
        sourceType: DocumentSourceType.LINK,
        sourceReference: page.url,
        normReference: job.normReference,
        author: job.author,
        webImportJobId: new Types.ObjectId(jobId),
        webImportPageId: page._id,
        ingestionStatus: IngestionStatus.PENDING,
        deletedAt: null,
      });

      await this.repository.updatePage(pageId, {
        status: WebImportPageStatus.INGESTING,
        documentId: document._id,
      });

      await this.ingestionQueue.add(JOB_NAMES.PROCESS_DOCUMENT, {
        documentId: document._id.toString(),
        cmsTags: job.config.tags,
      });
      this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTED, {
        documentId: document._id.toString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao importar página';
      await this.repository.updatePage(pageId, {
        status: WebImportPageStatus.FAILED,
        error: message,
      });
      await this.repository.refreshJobCounters(jobId);
      await this.finalizeJobIfDone(jobId);
      this.logger.error({ pageId, url: page.url, error: message }, 'Falha ao processar página web');
    }
  }

  @OnEvent(DomainEvents.DOCUMENT_INGESTION_FINISHED)
  async handleDocumentIngestionFinished(payload: {
    documentId: string;
    status: IngestionStatus;
    error?: string;
  }): Promise<void> {
    const page = await this.repository.findPageByDocumentId(payload.documentId);
    if (!page) return;

    const jobId = page.jobId.toString();
    const nextStatus =
      payload.status === IngestionStatus.COMPLETED
        ? WebImportPageStatus.COMPLETED
        : payload.status === IngestionStatus.CANCELLED
          ? WebImportPageStatus.SKIPPED
          : WebImportPageStatus.FAILED;

    await this.repository.updatePage(page._id.toString(), {
      status: nextStatus,
      error: nextStatus === WebImportPageStatus.FAILED ? payload.error : undefined,
    });

    const refreshed = await this.repository.refreshJobCounters(jobId);
    this.progressService.update(jobId, {
      pagesDiscovered: refreshed?.pagesDiscovered ?? 0,
      pagesCompleted: refreshed?.pagesCompleted ?? 0,
      pagesFailed: refreshed?.pagesFailed ?? 0,
      pagesSkipped: refreshed?.pagesSkipped ?? 0,
      message:
        nextStatus === WebImportPageStatus.COMPLETED
          ? `Página concluída: ${page.url}`
          : `Falha na página: ${page.url}`,
    });

    await this.finalizeJobIfDone(jobId);
  }

  private async finalizeJobIfDone(jobId: string): Promise<void> {
    const job = await this.repository.findJobById(jobId);
    if (!job || job.status === WebImportJobStatus.CANCELLED) return;

    const counts = await this.repository.countPagesByStatus(jobId);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (total === 0) return;

    const pending =
      (counts[WebImportPageStatus.PENDING] ?? 0) +
      (counts[WebImportPageStatus.FETCHING] ?? 0) +
      (counts[WebImportPageStatus.INGESTING] ?? 0);

    if (pending > 0) return;

    const refreshed = await this.repository.refreshJobCounters(jobId);
    await this.repository.updateJob(jobId, { status: WebImportJobStatus.COMPLETED });
    this.progressService.setPhase(
      jobId,
      'completed',
      `Importação concluída — ${refreshed?.pagesCompleted ?? 0} ok, ${refreshed?.pagesFailed ?? 0} falha(s), ${refreshed?.pagesSkipped ?? 0} ignorada(s)`,
      WebImportJobStatus.COMPLETED,
    );
  }

  private async enqueuePages(jobId: string, pageIds: string[], rateLimitMs: number): Promise<void> {
    for (let i = 0; i < pageIds.length; i++) {
      await this.webImportQueue.add(
        JOB_NAMES.PROCESS_WEB_IMPORT_PAGE,
        { pageId: pageIds[i], jobId },
        { delay: i * rateLimitMs },
      );
    }
  }

  private async removeQueuedJobs(jobId: string): Promise<void> {
    const states = ['waiting', 'delayed', 'active', 'paused'] as const;
    const jobs = await this.webImportQueue.getJobs([...states]);
    for (const queued of jobs) {
      if (queued.data?.jobId === jobId) {
        await queued.remove().catch(() => undefined);
      }
    }
  }
}
