import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicAccess } from '@common/decorators/access.decorators';
import { FieldQueryDto } from '../dtos/messaging.dto';
import { MessagingService } from '../services/messaging.service';

@ApiTags('messaging')
@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly configService: ConfigService,
  ) {}

  @PublicAccess()
  @Post('query')
  @ApiOperation({
    summary: 'Assistente de campo — consulta RAG com citação de norma (Pilar 3)',
  })
  query(@Body() dto: FieldQueryDto) {
    return this.messagingService.handleFieldQuery(dto);
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
