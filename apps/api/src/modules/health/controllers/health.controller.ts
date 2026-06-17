import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { Connection, ConnectionStates } from 'mongoose';
import { PublicAccess } from '@common/decorators/access.decorators';
import { QUEUE_NAMES } from '@queues/queues.constants';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue(QUEUE_NAMES.INGESTION) private readonly ingestionQueue: Queue,
  ) {}

  @PublicAccess()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const mongoOk = this.connection.readyState === ConnectionStates.connected;

    let redisOk = false;
    try {
      await this.ingestionQueue.getJobCounts();
      redisOk = true;
    } catch {
      redisOk = false;
    }

    const payload = {
      status: mongoOk && redisOk ? 'ok' : 'degraded',
      service: 'qi-conhecimento-api',
      checks: {
        mongodb: mongoOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    };

    if (!mongoOk || !redisOk) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
