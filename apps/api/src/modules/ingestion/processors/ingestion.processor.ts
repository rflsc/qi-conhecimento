import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { DomainEvents } from '@events/domain-events';
import { JOB_NAMES, QUEUE_NAMES } from '@queues/queues.constants';
import { EmbeddingService } from '@modules/knowledge/services/embedding.service';
import { KnowledgeRepository } from '@modules/knowledge/repositories/knowledge.repository';
import { DocumentIngestionService } from '../services/document-ingestion.service';
import { IngestionProgressService } from '../services/ingestion-progress.service';

@Injectable()
@Processor(QUEUE_NAMES.INGESTION)
export class IngestionProcessor extends WorkerHost {
  constructor(
    private readonly documentIngestionService: DocumentIngestionService,
    private readonly embeddingService: EmbeddingService,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly progressService: IngestionProgressService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(IngestionProcessor.name);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_NAMES.PROCESS_DOCUMENT:
        await this.documentIngestionService.processDocument(job.data.documentId as string);
        break;
      case JOB_NAMES.GENERATE_EMBEDDINGS:
        await this.generateEmbeddings(job.data.chunkId as string);
        break;
      default:
        this.logger.warn({ jobName: job.name }, 'Job desconhecido');
    }
  }

  private async generateEmbeddings(chunkId: string): Promise<void> {
    const chunk = await this.knowledgeRepository.findChunkById(chunkId);
    if (!chunk) {
      this.logger.warn({ chunkId }, 'Chunk não encontrado para embedding');
      return;
    }

    const documentId = chunk.documentId.toString();
    if (await this.knowledgeRepository.isDocumentCancelled(documentId)) {
      this.logger.info({ chunkId, documentId }, 'Embedding ignorado — ingestão cancelada');
      return;
    }

    const counts = await this.knowledgeRepository.countChunkEmbeddingsByDocument(documentId);
    const nextIndex = counts.withEmbedding + 1;
    this.progressService.embeddingStarted(
      documentId,
      chunkId,
      nextIndex,
      Math.max(counts.total, nextIndex),
    );

    const embedding = await this.embeddingService.embed(chunk.content);
    if (!embedding) {
      this.progressService.setPhase(
        documentId,
        'embedding',
        `Embedding ignorado — ${this.embeddingService.unavailableReason()}`,
        'warn',
      );
      this.logger.info({ chunkId }, `Embedding ignorado — ${this.embeddingService.unavailableReason()}`);
      return;
    }

    await this.knowledgeRepository.updateChunkEmbedding(chunkId, embedding, chunkId);
    this.eventEmitter.emit(DomainEvents.CHUNK_INDEXED, { chunkId, documentId });
    this.logger.info({ chunkId }, 'Embedding gerado');
  }
}
