import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@queues/queues.constants';
import { IngestionModule } from '@modules/ingestion/ingestion.module';
import { KnowledgeController } from './controllers/knowledge.controller';
import { KnowledgeRepository } from './repositories/knowledge.repository';
import { KnowledgeService } from './services/knowledge.service';
import { KnowledgeSeedService } from './services/knowledge-seed.service';
import { EmbeddingService } from './services/embedding.service';
import { RagService } from './services/rag.service';
import {
  KnowledgeDocumentModel,
  KnowledgeDocumentSchema,
} from './schemas/knowledge-document.schema';
import { KnowledgeChunkModel, KnowledgeChunkSchema } from './schemas/knowledge-chunk.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeDocumentModel.name, schema: KnowledgeDocumentSchema },
      { name: KnowledgeChunkModel.name, schema: KnowledgeChunkSchema },
    ]),
    BullModule.registerQueue({ name: QUEUE_NAMES.INGESTION }),
    forwardRef(() => IngestionModule),
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    KnowledgeRepository,
    KnowledgeSeedService,
    EmbeddingService,
    RagService,
  ],
  exports: [KnowledgeService, KnowledgeRepository, EmbeddingService, RagService],
})
export class KnowledgeModule {}
