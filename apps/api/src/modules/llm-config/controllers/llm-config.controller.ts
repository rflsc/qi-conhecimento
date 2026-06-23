import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@qi-conhecimento/shared-types';
import { Roles } from '@common/decorators/access.decorators';
import { RolesGuard } from '@common/guards/roles.guard';
import { LlmConfigService } from '../services/llm-config.service';
import { UpdateLlmConfigDto } from '../dto/llm-config.dto';

@ApiTags('LLM Config')
@ApiBearerAuth('JWT-auth')
@Controller('llm-config')
@UseGuards(RolesGuard)
export class LlmConfigController {
  constructor(private readonly llmConfigService: LlmConfigService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get AI provider settings' })
  getConfig() {
    return this.llmConfigService.getConfig();
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update AI provider settings' })
  updateConfig(@Body() dto: UpdateLlmConfigDto) {
    return this.llmConfigService.updateConfig(dto);
  }
}
