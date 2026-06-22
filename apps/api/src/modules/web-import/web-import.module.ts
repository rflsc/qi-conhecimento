import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@queues/queues.constants';
import { KnowledgeModule } from '@modules/knowledge/knowledge.module';
import { IngestionModule } from '@modules/ingestion/ingestion.module';
import { WebImportController } from './controllers/web-import.controller';
import { WebImportRepository } from './repositories/web-import.repository';
import { WebImportService } from './services/web-import.service';
import { WebDiscoveryService } from './services/web-discovery.service';
import { WebFetchService } from './services/web-fetch.service';
import { WebImportProgressService } from './services/web-import-progress.service';
import { WebImportSettingsService } from './services/web-import-settings.service';
import { WebImportProcessor } from './processors/web-import.processor';
import { SingleUrlDiscovery } from './discovery/single-url.discovery';
import { SitemapDiscovery } from './discovery/sitemap.discovery';
import { ListingCrawlDiscovery } from './discovery/listing-crawl.discovery';
import { WebImportJobModel, WebImportJobSchema } from './schemas/web-import-job.schema';
import { WebImportPageModel, WebImportPageSchema } from './schemas/web-import-page.schema';
import {
  WebImportSettingsModel,
  WebImportSettingsSchema,
} from './schemas/web-import-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebImportJobModel.name, schema: WebImportJobSchema },
      { name: WebImportPageModel.name, schema: WebImportPageSchema },
      { name: WebImportSettingsModel.name, schema: WebImportSettingsSchema },
    ]),
    BullModule.registerQueue({ name: QUEUE_NAMES.WEB_IMPORT }),
    forwardRef(() => KnowledgeModule),
    IngestionModule,
  ],
  controllers: [WebImportController],
  providers: [
    WebImportRepository,
    WebImportService,
    WebDiscoveryService,
    WebFetchService,
    WebImportProgressService,
    WebImportSettingsService,
    WebImportProcessor,
    SingleUrlDiscovery,
    SitemapDiscovery,
    ListingCrawlDiscovery,
  ],
  exports: [WebImportService],
})
export class WebImportModule {}
