import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { IngestionStatus } from '@qi-conhecimento/shared-types';
import { JOB_NAMES, QUEUE_NAMES } from '@queues/queues.constants';

@Injectable()
@Processor(QUEUE_NAMES.INGESTION)
export class IngestionProcessor extends WorkerHost {
  constructor(private readonly logger: PinoLogger) {
    super();
    this.logger.setContext(IngestionProcessor.name);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_NAMES.PROCESS_DOCUMENT:
        this.logger.info({ documentId: job.data.documentId }, 'Processando documento multimodal');
        // TODO: PDF parser, OCR (visão computacional), HTML extractor → Markdown
        break;
      case JOB_NAMES.GENERATE_EMBEDDINGS:
        this.logger.info({ chunkId: job.data.chunkId }, 'Gerando embeddings semânticos');
        // TODO: OpenAI embeddings + vector store
        break;
      default:
        this.logger.warn({ jobName: job.name }, 'Job desconhecido');
    }

    void IngestionStatus.COMPLETED;
  }
}
