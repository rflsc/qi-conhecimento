import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@qi-conhecimento/shared-types';
import { PublicAccess, Roles, ServiceAccess } from '@common/decorators/access.decorators';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { FieldQueryDto } from '../dtos/messaging.dto';
import { MessagingService } from '../services/messaging.service';

@ApiTags('messaging')
@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly configService: ConfigService,
  ) {}

  @ServiceAccess()
  @Post('query')
  @ApiOperation({
    summary:
      'Assistente de campo — consulta RAG com citação de norma (Pilar 3). Integração Qi Agents: header X-Service-Key',
  })
  query(@Body() dto: FieldQueryDto) {
    return this.messagingService.handleFieldQuery(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @Get('queries')
  @ApiOperation({
    summary: 'Histórico de consultas de campo (field_queries) — painel admin /queries',
  })
  listQueries(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.messagingService.listFieldQueries(Number(page), Number(limit));
  }

  @PublicAccess()
  @Get('whatsapp/webhook')
  @ApiOperation({ summary: 'Verificação do webhook WhatsApp' })
  verifyWhatsApp(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') ?? '';
    return this.messagingService.verifyWhatsApp(mode, token, challenge, verifyToken);
  }

  @PublicAccess()
  @Post('whatsapp/webhook')
  @ApiOperation({ summary: 'Recebe mensagens WhatsApp (texto/áudio)' })
  receiveWhatsApp(@Body() _payload: unknown) {
    // MVP: stub — integrar Meta Cloud API + transcrição de áudio
    return { status: 'received' };
  }
}
