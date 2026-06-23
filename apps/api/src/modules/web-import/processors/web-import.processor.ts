import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { JOB_NAMES, QUEUE_NAMES, BULLMQ_WORKER_SETTINGS } from '@queues/queues.constants';
import { WebImportService } from '../services/web-import.service';

@Injectable()
@Processor(QUEUE_NAMES.WEB_IMPORT, { concurrency: 1, ...BULLMQ_WORKER_SETTINGS })
export class WebImportProcessor extends WorkerHost {
  constructor(
    private readonly webImportService: WebImportService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(WebImportProcessor.name);
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB_NAMES.RUN_WEB_IMPORT) {
      await this.webImportService.runImport(job.data.jobId as string);
      return;
    }

    if (job.name === JOB_NAMES.PROCESS_WEB_IMPORT_PAGE) {
      await this.webImportService.processPage(job.data.pageId as string);
      return;
    }

    this.logger.warn({ jobName: job.name }, 'Job desconhecido na fila web-import');
  }
}
