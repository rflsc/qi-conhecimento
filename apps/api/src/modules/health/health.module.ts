import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@queues/queues.constants';
import { HealthController } from './controllers/health.controller';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.INGESTION })],
  controllers: [HealthController],
})
export class HealthModule {}
