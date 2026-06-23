import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { DomainEvents } from '@events/domain-events';
import { JOB_NAMES, QUEUE_NAMES, BULLMQ_WORKER_SETTINGS } from '@queues/queues.constants';
import { IngestionStatus } from '@qi-conhecimento/shared-types';
import { getEmbeddingWorkerConcurrency } from '../../../config/embedding.config';
import { EmbeddingService } from '@modules/knowledge/services/embedding.service';
import { KnowledgeRepository } from '@modules/knowledge/repositories/knowledge.repository';
import { IngestionProgressService } from '../services/ingestion-progress.service';

@Injectable()
@Processor(QUEUE_NAMES.EMBEDDING, {
  concurrency: getEmbeddingWorkerConcurrency(),
  ...BULLMQ_WORKER_SETTINGS,
})
export class EmbeddingProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly progressService: IngestionProgressService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(EmbeddingProcessor.name);
  }

  onModuleInit(): void {
    this.logger.info(
      { concurrency: getEmbeddingWorkerConcurrency(), queue: QUEUE_NAMES.EMBEDDING },
      'Worker de embeddings pronto',
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_NAMES.GENERATE_EMBEDDINGS) {
      this.logger.warn({ jobName: job.name }, 'Job desconhecido na fila de embeddings');
      return;
    }

    await this.generateEmbedding(job.data.chunkId as string);
  }

  private async generateEmbedding(chunkId: string): Promise<void> {
    const chunk = await this.knowledgeRepository.findChunkById(chunkId);
    if (!chunk) {
      this.logger.warn({ chunkId }, 'Chunk não encontrado para embedding — job ignorado');
      return;
    }

    const documentId = chunk.documentId.toString();
    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) {
      this.logger.info({ chunkId, documentId }, 'Embedding ignorado — documento removido');
      return;
    }

    if (document.ingestionStatus === IngestionStatus.CANCELLED) {
      this.logger.info({ chunkId, documentId }, 'Embedding ignorado — ingestão cancelada');
      return;
    }

    const counts = await this.knowledgeRepository.countChunkEmbeddingsByDocument(documentId);
    const total = Math.max(counts.total, counts.withEmbedding + 1);
    this.progressService.embeddingStarted(documentId, total);

    const embedding = await this.embeddingService.embed(chunk.content);
    if (await this.knowledgeRepository.isDocumentCancelled(documentId)) {
      this.logger.info({ chunkId, documentId }, 'Embedding descartado — ingestão cancelada');
      return;
    }
    if (!embedding) {
      const reason = await this.embeddingService.unavailableReason();
      this.progressService.appendEmbeddingWarning(
        documentId,
        `Embedding ignorado — ${reason}`,
      );
      this.logger.info({ chunkId }, `Embedding ignorado — ${reason}`);
      return;
    }

    await this.knowledgeRepository.updateChunkEmbedding(chunkId, embedding, chunkId);
    await this.progressService.recordEmbeddingDone(documentId);
    this.eventEmitter.emit(DomainEvents.CHUNK_INDEXED, { chunkId, documentId });
    this.logger.info({ chunkId }, 'Embedding gerado');
  }
}
