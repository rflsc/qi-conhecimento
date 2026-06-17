import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@qi-conhecimento/shared-types';
import { Roles } from '@common/decorators/access.decorators';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import {
  CreateKnowledgeDocumentDto,
  CreateManualContentDto,
  SearchKnowledgeDto,
} from '../dtos/knowledge.dto';
import { KnowledgeService } from '../services/knowledge.service';

@ApiTags('knowledge')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('documents')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Lista documentos técnicos ingeridos (Hub — Pilar 1)' })
  @ApiResponse({ status: 200 })
  listDocuments(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.knowledgeService.listDocuments(Number(page), Number(limit));
  }

  @Post('documents')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({
    summary: 'Registra nova fonte (PDF, imagem, link, etc.) para ingestão multimodal',
  })
  @ApiResponse({ status: 201 })
  createDocument(@Body() dto: CreateKnowledgeDocumentDto) {
    return this.knowledgeService.createDocument(dto);
  }

  @Post('documents/manual-content')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'CMS interno — procedimentos e notas de campo em Markdown' })
  @ApiResponse({ status: 201 })
  createManualContent(@Body() dto: CreateManualContentDto) {
    return this.knowledgeService.createManualContent(dto);
  }

  @Post('search')
  @Roles(UserRole.ADMIN, UserRole.EDITOR, UserRole.USER)
  @ApiOperation({ summary: 'Busca híbrida semântica + palavra-chave (Pilar 2)' })
  @ApiResponse({ status: 200 })
  search(@Body() dto: SearchKnowledgeDto) {
    return this.knowledgeService.search(dto);
  }
}
