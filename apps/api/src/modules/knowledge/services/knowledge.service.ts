import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
import { mapChunk, mapDocument } from '../interfaces/knowledge.mapper';
import { KnowledgeRepository } from '../repositories/knowledge.repository';
import { RagService } from './rag.service';
import { StorageService } from '@modules/ingestion/services/storage.service';
import { IngestionProgressService } from '@modules/ingestion/services/ingestion-progress.service';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly ragService: RagService,
    private readonly storageService: StorageService,
    private readonly eventEmitter: EventEmitter2,
    private readonly progressService: IngestionProgressService,
    @InjectQueue(QUEUE_NAMES.INGESTION) private readonly ingestionQueue: Queue,
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

    const relativePath = await this.storageService.saveFile(document._id.toString(), file);
    document.sourceReference = relativePath;
    await document.save();

    await this.ingestionQueue.add(JOB_NAMES.PROCESS_DOCUMENT, {
      documentId: document._id.toString(),
    });

    this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTED, {
      documentId: document._id.toString(),
    });

    return mapDocument(document);
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

    await this.ingestionQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, {
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

    await this.ingestionQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, {
      chunkId: chunk._id.toString(),
    });

    const populated = await chunk.populate('documentId');
    return mapChunk(populated);
  }

  async listDocuments(page: number, limit: number) {
    const [data, total] = await this.knowledgeRepository.findDocuments(page, limit);
    return { data: data.map(mapDocument), total, page, limit };
  }

  async listChunks(page: number, limit: number, documentId?: string) {
    const [data, total] = await this.knowledgeRepository.findChunks(page, limit, documentId);
    return { data: data.map(mapChunk), total, page, limit };
  }

  async search(dto: SearchKnowledgeDto) {
    const results = await this.ragService.hybridSearch(dto.query, dto.specialty, 10);
    return { query: dto.query, results };
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
        this.ingestionQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, { chunkId }),
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

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

        unsubscribe = this.progressService.subscribe(documentId, (progress) => {
          if (closed) return;
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
        });

        heartbeat = setInterval(() => {
          if (closed) return;
          res.write(': heartbeat\n\n');
        }, 15_000);
      })
      .catch(() => {
        if (!closed) {
          res.status(404).json({ message: 'Document not found' });
        }
      });
  }

  async cancelDocumentIngestion(documentId: string) {
    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) throw new NotFoundException('Document not found');

    if (
      document.ingestionStatus !== IngestionStatus.PENDING &&
      document.ingestionStatus !== IngestionStatus.PROCESSING
    ) {
      throw new BadRequestException(
        'Só é possível cancelar documentos pendentes ou em processamento',
      );
    }

    const chunkIds = await this.knowledgeRepository.findChunkIdsByDocument(documentId);
    const removedJobs = await this.removeIngestionJobs(documentId, chunkIds);
    const removedChunks = await this.knowledgeRepository.softDeleteChunksByDocument(documentId);

    await this.knowledgeRepository.updateDocumentStatus(
      documentId,
      IngestionStatus.CANCELLED,
      'Cancelado pelo usuário',
    );
    this.progressService.cancel(documentId, 'Ingestão cancelada pelo usuário');

    const updated = await this.knowledgeRepository.findDocumentById(documentId);
    return {
      document: mapDocument(updated!),
      removedJobs,
      removedChunks,
    };
  }

  private async removeIngestionJobs(documentId: string, chunkIds: string[]): Promise<number> {
    const chunkIdSet = new Set(chunkIds);
    const jobs = await this.ingestionQueue.getJobs(['waiting', 'delayed', 'paused', 'active']);
    let removed = 0;

    for (const job of jobs) {
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
