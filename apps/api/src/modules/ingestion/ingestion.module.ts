import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@queues/queues.constants';
import { KnowledgeModule } from '@modules/knowledge/knowledge.module';
import { IngestionProcessor } from './processors/ingestion.processor';
import { PdfParser } from './parsers/pdf.parser';
import { ImageParser } from './parsers/image.parser';
import { HtmlParser } from './parsers/html.parser';
import { ParserFactory } from './parsers/parser.factory';
import { StorageService } from './services/storage.service';
import { ChunkingService } from './services/chunking.service';
import { DocumentIngestionService } from './services/document-ingestion.service';
import { DoclingClient } from './services/docling.client';
import { IngestionProgressService } from './services/ingestion-progress.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.INGESTION }),
    forwardRef(() => KnowledgeModule),
  ],
  providers: [
    IngestionProcessor,
    StorageService,
    ChunkingService,
    DocumentIngestionService,
    DoclingClient,
    IngestionProgressService,
    PdfParser,
    ImageParser,
    HtmlParser,
    ParserFactory,
  ],
  exports: [StorageService, DocumentIngestionService, IngestionProgressService],
})
export class IngestionModule {}
