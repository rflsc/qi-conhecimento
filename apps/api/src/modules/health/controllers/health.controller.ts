import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicAccess } from '@common/decorators/access.decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @PublicAccess()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      service: 'qi-conhecimento-api',
      timestamp: new Date().toISOString(),
    };
  }
}
