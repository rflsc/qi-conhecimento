import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@queues/queues.constants';
import { IngestionProcessor } from './processors/ingestion.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.INGESTION })],
  providers: [IngestionProcessor],
})
export class IngestionModule {}
