import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DocumentSourceType, UserRole } from '@qi-conhecimento/shared-types';
import { PublicAccess, Roles } from '@common/decorators/access.decorators';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import {
  CreateCmsEntryDto,
  CreateKnowledgeDocumentDto,
  CreateManualContentDto,
  ImportLinkDocumentDto,
  SearchKnowledgeDto,
  UploadDocumentDto,
} from '../dtos/knowledge.dto';
import { KnowledgeService } from '../services/knowledge.service';

@ApiTags('knowledge')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Totais de documentos e chunks' })
  getStats() {
    return this.knowledgeService.getStats();
  }

  @Get('documents')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Lista documentos técnicos ingeridos (Hub — Pilar 1)' })
  @ApiResponse({ status: 200 })
  listDocuments(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.knowledgeService.listDocuments(Number(page), Number(limit));
  }

  @Get('chunks')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Lista pílulas de conhecimento (chunks)' })
  listChunks(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('documentId') documentId?: string,
  ) {
    return this.knowledgeService.listChunks(Number(page), Number(limit), documentId);
  }

  @Post('documents')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({
    summary: 'Registra nova fonte (link/HTML) para ingestão multimodal',
  })
  @ApiResponse({ status: 201 })
  createDocument(@Body() dto: CreateKnowledgeDocumentDto) {
    return this.knowledgeService.createDocument(dto);
  }

  @Post('documents/upload')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Upload de PDF ou imagem para ingestão' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title', 'specialty', 'sourceType'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        specialty: { type: 'string' },
        sourceType: { type: 'string', enum: ['pdf', 'image'] },
        normReference: { type: 'string' },
        author: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.knowledgeService.uploadDocument(file, dto);
  }

  @Post('documents/import-link')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Importa conteúdo de URL (HTML/link)' })
  @ApiResponse({ status: 201 })
  importLink(@Body() dto: ImportLinkDocumentDto) {
    return this.knowledgeService.createDocument({
      title: dto.title,
      specialty: dto.specialty,
      sourceType: DocumentSourceType.LINK,
      sourceReference: dto.sourceReference,
      normReference: dto.normReference,
      author: dto.author,
    });
  }

  @Post('cms')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'CMS — cria documento + conteúdo Markdown em uma operação' })
  @ApiResponse({ status: 201 })
  createCmsEntry(@Body() dto: CreateCmsEntryDto) {
    return this.knowledgeService.createCmsEntry(dto);
  }

  @Post('documents/manual-content')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'CMS interno — adiciona conteúdo a documento existente' })
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

  @PublicAccess()
  @Post('public-search')
  @ApiOperation({ summary: 'Busca híbrida pública (LP web)' })
  @ApiResponse({ status: 200 })
  publicSearch(@Body() dto: SearchKnowledgeDto) {
    return this.knowledgeService.publicSearch(dto);
  }

  @PublicAccess()
  @Post('public-ask')
  @ApiOperation({ summary: 'RAG público — busca + resposta com citações (LP web)' })
  @ApiResponse({ status: 200 })
  publicAsk(@Body() dto: SearchKnowledgeDto) {
    return this.knowledgeService.publicAsk(dto);
  }

  @Get('documents/:documentId/ingestion-progress')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Snapshot do progresso de ingestão/parser/embedding' })
  getIngestionProgress(@Param('documentId') documentId: string) {
    return this.knowledgeService.getIngestionProgress(documentId);
  }

  @Get('documents/:documentId/ingestion-stream')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Stream SSE do progresso de ingestão em tempo real' })
  streamIngestionProgress(
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    this.knowledgeService.streamIngestionProgress(documentId, res);
  }

  @Post('documents/:documentId/cancel-ingestion')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Cancela ingestão pendente ou em processamento' })
  @ApiResponse({ status: 200 })
  cancelIngestion(@Param('documentId') documentId: string) {
    return this.knowledgeService.cancelDocumentIngestion(documentId);
  }

  @Post('documents/:documentId/reindex-embeddings')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({
    summary: 'Reenfileira embeddings de todos os chunks de um documento',
  })
  @ApiResponse({ status: 200 })
  reindexEmbeddings(@Param('documentId') documentId: string) {
    return this.knowledgeService.reindexDocumentEmbeddings(documentId);
  }
}
