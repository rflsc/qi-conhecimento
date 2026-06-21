import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { JOB_NAMES, QUEUE_NAMES } from '@queues/queues.constants';
import { DocumentIngestionService } from '../services/document-ingestion.service';

@Injectable()
@Processor(QUEUE_NAMES.INGESTION, { concurrency: 1 })
export class IngestionProcessor extends WorkerHost {
  constructor(
    private readonly documentIngestionService: DocumentIngestionService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(IngestionProcessor.name);
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_NAMES.PROCESS_DOCUMENT) {
      this.logger.warn({ jobName: job.name }, 'Job desconhecido na fila de ingestão');
      return;
    }

    await this.documentIngestionService.processDocument(job.data.documentId as string, {
      allowWeakParserFallback: job.data.allowWeakParserFallback === true,
      doOcr: job.data.doOcr === true,
      cmsTags: Array.isArray(job.data.cmsTags) ? (job.data.cmsTags as string[]) : undefined,
    });
  }
}
