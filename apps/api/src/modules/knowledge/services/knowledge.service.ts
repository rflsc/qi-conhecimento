import { Injectable, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import type { Response } from 'express';
import { DocumentSourceType, IngestionStatus } from '@qi-conhecimento/shared-types';
import { stripMarkdownToPlain } from '@qi-conhecimento/shared-utils';
import { DomainEvents } from '@events/domain-events';
import { JOB_NAMES, QUEUE_NAMES } from '@queues/queues.constants';
import {
  CreateCmsEntryDto,
  CreateKnowledgeDocumentDto,
  CreateManualContentDto,
  SearchKnowledgeDto,
  UploadDocumentDto,
} from '../dtos/knowledge.dto';
import { mapChunk, mapCitation, mapDocument } from '../interfaces/knowledge.mapper';
import { KnowledgeRepository } from '../repositories/knowledge.repository';
import { RagService } from './rag.service';
import { StorageService } from '@modules/ingestion/services/storage.service';
import { IngestionProgressService } from '@modules/ingestion/services/ingestion-progress.service';
import { DoclingClient } from '@modules/ingestion/services/docling.client';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly ragService: RagService,
    private readonly storageService: StorageService,
    private readonly eventEmitter: EventEmitter2,
    private readonly progressService: IngestionProgressService,
    private readonly doclingClient: DoclingClient,
    @InjectQueue(QUEUE_NAMES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EMBEDDING) private readonly embeddingQueue: Queue,
  ) {}

  async createDocument(dto: CreateKnowledgeDocumentDto) {
    const document = await this.knowledgeRepository.createDocument({
      ...dto,
      ingestionStatus: IngestionStatus.PENDING,
      deletedAt: null,
    });

    await this.ingestionQueue.add(JOB_NAMES.PROCESS_DOCUMENT, {
      documentId: document._id.toString(),
    });

    this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTED, {
      documentId: document._id.toString(),
    });

    return mapDocument(document);
  }

  async uploadDocument(file: Express.Multer.File, dto: UploadDocumentDto) {
    if (!file) throw new BadRequestException('Arquivo obrigatório');

    const document = await this.knowledgeRepository.createDocument({
      title: dto.title,
      specialty: dto.specialty,
      sourceType: dto.sourceType,
      normReference: dto.normReference,
      author: dto.author,
      ingestionStatus: IngestionStatus.PENDING,
      deletedAt: null,
    });

    try {
      const relativePath = await this.storageService.saveFile(document._id.toString(), file);
      document.sourceReference = relativePath;
      await document.save();

      await this.enqueueIngestion(document._id.toString(), {
        allowWeakParserFallback: dto.allowWeakParserFallback,
      });
      return mapDocument(document);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Falha ao salvar o arquivo',
      );
    }
  }

  private async enqueueIngestion(
    documentId: string,
    options?: { allowWeakParserFallback?: boolean },
  ) {
    try {
      await this.ingestionQueue.add(JOB_NAMES.PROCESS_DOCUMENT, {
        documentId,
        allowWeakParserFallback: options?.allowWeakParserFallback === true,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Redis indisponível — não foi possível enfileirar a ingestão. Verifique REDIS_URL ou rode pnpm infra:up',
      );
    }

    this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTED, { documentId });
  }

  async createCmsEntry(dto: CreateCmsEntryDto) {
    const document = await this.knowledgeRepository.createDocument({
      title: dto.title,
      specialty: dto.specialty,
      sourceType: DocumentSourceType.MANUAL_TEXT,
      normReference: dto.normReference,
      ingestionStatus: IngestionStatus.COMPLETED,
      deletedAt: null,
    });

    const chunk = await this.knowledgeRepository.createChunk({
      documentId: document._id,
      content: stripMarkdownToPlain(dto.markdownContent),
      markdownContent: dto.markdownContent,
      specialty: dto.specialty,
      tags: dto.tags ?? [],
      chapter: dto.title,
      deletedAt: null,
    });

    await this.embeddingQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, {
      chunkId: chunk._id.toString(),
    });

    this.eventEmitter.emit(DomainEvents.CHUNK_INDEXED, {
      documentId: document._id.toString(),
      chunkId: chunk._id.toString(),
    });

    return {
      document: mapDocument(document),
      chunk: mapChunk(await chunk.populate('documentId')),
    };
  }

  async createManualContent(dto: CreateManualContentDto) {
    const document = await this.knowledgeRepository.findDocumentById(dto.documentId);
    if (!document) throw new NotFoundException('Document not found');

    const chunk = await this.knowledgeRepository.createChunk({
      documentId: new Types.ObjectId(dto.documentId),
      content: stripMarkdownToPlain(dto.markdownContent),
      markdownContent: dto.markdownContent,
      specialty: dto.specialty,
      tags: dto.tags ?? [],
      chapter: dto.title,
      deletedAt: null,
    });

    await this.knowledgeRepository.updateDocumentStatus(dto.documentId, IngestionStatus.COMPLETED);

    await this.embeddingQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, {
      chunkId: chunk._id.toString(),
    });

    const populated = await chunk.populate('documentId');
    return mapChunk(populated);
  }

  async listDocuments(page: number, limit: number) {
    const [data, total] = await this.knowledgeRepository.findDocuments(page, limit);
    const enriched = await Promise.all(
      data.map(async (doc) => {
        const counts = await this.knowledgeRepository.countChunkEmbeddingsByDocument(
          doc._id.toString(),
        );
        return {
          ...mapDocument(doc),
          chunkCount: counts.total,
          embeddingsDone: counts.withEmbedding,
          embeddingsPending: counts.total > counts.withEmbedding,
        };
      }),
    );
    return { data: enriched, total, page, limit };
  }

  async listChunks(page: number, limit: number, documentId?: string) {
    const [data, total] = await this.knowledgeRepository.findChunks(page, limit, documentId);
    return { data: data.map(mapChunk), total, page, limit };
  }

  async search(dto: SearchKnowledgeDto) {
    const results = await this.ragService.hybridSearch(dto.query, dto.specialty, 10);
    return { query: dto.query, results };
  }

  async publicSearch(dto: SearchKnowledgeDto) {
    return this.search(dto);
  }

  async publicAsk(dto: SearchKnowledgeDto) {
    const chunks = await this.ragService.retrieveChunksForAnswer(dto.query, dto.specialty);

    const citations = chunks.map(mapCitation);
    const answer = await this.ragService.generateAnswer(dto.query, chunks);

    return { query: dto.query, answer, citations };
  }

  async reindexDocumentEmbeddings(documentId: string) {
    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) throw new NotFoundException('Document not found');

    const chunkIds = await this.knowledgeRepository.findChunkIdsByDocument(documentId);
    if (chunkIds.length === 0) {
      throw new BadRequestException('Documento sem chunks para reindexar');
    }

    await Promise.all(
      chunkIds.map((chunkId) =>
        this.embeddingQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, { chunkId }),
      ),
    );

    this.progressService.init(documentId);
    this.progressService.setPhase(
      documentId,
      'embedding',
      `Reindexação: ${chunkIds.length} embedding(s) enfileirado(s)`,
    );

    return { documentId, chunksQueued: chunkIds.length };
  }

  async getParserStatus() {
    return this.doclingClient.checkHealth();
  }

  async getIngestionProgress(documentId: string) {
    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) throw new NotFoundException('Document not found');

    try {
      return await this.progressService.getSnapshot(documentId);
    } catch {
      throw new NotFoundException('Document not found');
    }
  }

  streamIngestionProgress(documentId: string, res: Response): void {
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;

    const cleanup = () => {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    };

    res.on('close', cleanup);

    void this.getIngestionProgress(documentId)
      .then((snapshot) => {
        if (closed) return;

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

        unsubscribe = this.progressService.subscribe(documentId, (progress) => {
          if (closed) return;
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
        });

        heartbeat = setInterval(() => {
          if (closed) return;
          void this.progressService
            .getSnapshot(documentId)
            .then((current) => {
              if (!closed) res.write(`data: ${JSON.stringify(current)}\n\n`);
            })
            .catch(() => undefined);
        }, 5_000);
      })
      .catch(() => {
        if (!closed && !res.headersSent) {
          res.status(404).json({ message: 'Document not found' });
        } else {
          cleanup();
        }
      });
  }

  async cancelDocumentIngestion(documentId: string) {
    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) throw new NotFoundException('Document not found');

    if (document.ingestionStatus === IngestionStatus.CANCELLED) {
      throw new BadRequestException('Ingestão já está cancelada');
    }

    const chunkIds = await this.knowledgeRepository.findChunkIdsByDocument(documentId);
    const embeddingCounts = await this.knowledgeRepository.countChunkEmbeddingsByDocument(documentId);
    const embeddingsPending = embeddingCounts.total > embeddingCounts.withEmbedding;
    const cancellable =
      document.ingestionStatus === IngestionStatus.PENDING ||
      document.ingestionStatus === IngestionStatus.PROCESSING ||
      (document.ingestionStatus === IngestionStatus.COMPLETED && embeddingsPending);

    if (!cancellable) {
      throw new BadRequestException(
        'Só é possível cancelar documentos pendentes, em processamento ou com embeddings ainda na fila',
      );
    }

    // Marca cancelado antes de drenar a fila — jobs ativos respeitam o status ao persistir.
    await this.knowledgeRepository.updateDocumentStatus(
      documentId,
      IngestionStatus.CANCELLED,
      'Cancelado pelo usuário',
    );
    this.progressService.cancel(documentId, 'Ingestão cancelada pelo usuário');

    const removedJobs = await this.removeIngestionJobs(documentId, chunkIds);
    const removedChunks = await this.knowledgeRepository.softDeleteChunksByDocument(documentId);

    const updated = await this.knowledgeRepository.findDocumentById(documentId);
    return {
      document: mapDocument(updated!),
      removedJobs,
      removedChunks,
    };
  }

  private async removeIngestionJobs(documentId: string, chunkIds: string[]): Promise<number> {
    const chunkIdSet = new Set(chunkIds);
    const [ingestionJobs, embeddingJobs] = await Promise.all([
      this.ingestionQueue.getJobs(['waiting', 'delayed', 'paused', 'active']),
      this.embeddingQueue.getJobs(['waiting', 'delayed', 'paused', 'active']),
    ]);
    let removed = 0;

    for (const job of [...ingestionJobs, ...embeddingJobs]) {
      const isProcessJob =
        job.name === JOB_NAMES.PROCESS_DOCUMENT && job.data.documentId === documentId;
      const isEmbeddingJob =
        job.name === JOB_NAMES.GENERATE_EMBEDDINGS && chunkIdSet.has(job.data.chunkId as string);

      if (!isProcessJob && !isEmbeddingJob) continue;

      try {
        await job.remove();
        removed += 1;
      } catch {
        // Job ativo pode não ser removível — o worker respeita status cancelled.
      }
    }

    return removed;
  }

  async reprocessDocumentWithOcr(documentId: string) {
    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) throw new NotFoundException('Document not found');

    if (document.sourceType !== DocumentSourceType.PDF) {
      throw new BadRequestException('OCR só se aplica a documentos PDF');
    }

    if (!document.offerOcrRetry) {
      throw new BadRequestException('Não há oferta de reprocessamento com OCR para este documento');
    }

    if (!this.doclingClient.isEnabled) {
      throw new ServiceUnavailableException(
        'Docling não está configurado. Defina PARSER_SERVICE_URL e rode pnpm parser:dev',
      );
    }

    if (!document.sourceReference) {
      throw new BadRequestException('Arquivo do documento não encontrado');
    }

    const chunkIds = await this.knowledgeRepository.findChunkIdsByDocument(documentId);
    await this.removeIngestionJobs(documentId, chunkIds);
    await this.knowledgeRepository.softDeleteChunksByDocument(documentId);
    await this.knowledgeRepository.clearParseQualityFlags(documentId);
    await this.knowledgeRepository.updateDocumentStatus(documentId, IngestionStatus.PENDING, null);

    this.progressService.init(documentId);
    this.progressService.setPhase(
      documentId,
      'queued',
      'Reprocessamento com OCR enfileirado — as pílulas anteriores serão substituídas',
    );

    try {
      await this.ingestionQueue.add(JOB_NAMES.PROCESS_DOCUMENT, {
        documentId,
        doOcr: true,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Redis indisponível — não foi possível enfileirar o reprocessamento com OCR',
      );
    }

    this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTED, { documentId });

    const updated = await this.knowledgeRepository.findDocumentById(documentId);
    return mapDocument(updated!);
  }

  async dismissOcrRetry(documentId: string) {
    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) throw new NotFoundException('Document not found');

    if (!document.offerOcrRetry) {
      throw new BadRequestException('Não há oferta de OCR pendente para este documento');
    }

    await this.knowledgeRepository.clearOcrRetryOffer(documentId);
    this.progressService.clearOcrRetryOffer(documentId);

    const updated = await this.knowledgeRepository.findDocumentById(documentId);
    return mapDocument(updated!);
  }

  async deleteDocument(documentId: string) {
    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) throw new NotFoundException('Document not found');

    const chunkIds = await this.knowledgeRepository.findAllChunkIdsByDocument(documentId);
    const removedJobs = await this.removeIngestionJobs(documentId, chunkIds);
    const deletedChunks = await this.knowledgeRepository.hardDeleteChunksByDocument(documentId);

    const hasLocalStorage =
      document.sourceReference &&
      !/^https?:\/\//i.test(document.sourceReference) &&
      (document.sourceType === DocumentSourceType.PDF ||
        document.sourceType === DocumentSourceType.IMAGE);

    let storageRemoved = false;
    if (hasLocalStorage) {
      await this.storageService.deleteDocumentStorage(documentId);
      storageRemoved = true;
    }

    const deletedDocument = await this.knowledgeRepository.hardDeleteDocument(documentId);
    if (!deletedDocument) {
      throw new NotFoundException('Document not found');
    }

    this.progressService.purgeDocument(documentId);

    return {
      documentId,
      deletedChunks,
      removedJobs,
      storageRemoved,
    };
  }

  async getStats() {
    const [documents, chunks, chunksWithEmbeddings] = await Promise.all([
      this.knowledgeRepository.countDocuments(),
      this.knowledgeRepository.countChunks(),
      this.knowledgeRepository.countChunksWithEmbeddings(),
    ]);
    return {
      documents,
      chunks,
      chunksWithEmbeddings,
      chunksWithoutEmbeddings: chunks - chunksWithEmbeddings,
    };
  }
}
