import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@queues/queues.constants';
import { KnowledgeController } from './controllers/knowledge.controller';
import { KnowledgeRepository } from './repositories/knowledge.repository';
import { KnowledgeService } from './services/knowledge.service';
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
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeRepository],
  exports: [KnowledgeService, KnowledgeRepository],
})
export class KnowledgeModule {}
