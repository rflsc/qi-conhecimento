import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Connection, ConnectionStates } from 'mongoose';
import { PublicAccess } from '@common/decorators/access.decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @PublicAccess()
  @Get()
  @ApiOperation({ summary: 'Health check (MongoDB)' })
  check() {
    const mongoOk = this.connection.readyState === ConnectionStates.connected;

    const payload = {
      status: mongoOk ? 'ok' : 'degraded',
      service: 'qi-conhecimento-api',
      checks: {
        mongodb: mongoOk ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    };

    if (!mongoOk) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
