import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole, WebImportPageStatus } from '@qi-conhecimento/shared-types';
import { Roles } from '@common/decorators/access.decorators';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { CreateWebImportJobDto } from '../dtos/web-import.dto';
import { UpdateWebImportSettingsDto } from '../dtos/web-import-settings.dto';
import { WebImportService } from '../services/web-import.service';

@ApiTags('web-import')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('knowledge/web-imports')
export class WebImportController {
  constructor(private readonly webImportService: WebImportService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Cria job de importação web em lote' })
  @ApiResponse({ status: 201 })
  createJob(@Body() dto: CreateWebImportJobDto) {
    return this.webImportService.createJob(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Lista jobs de importação web' })
  listJobs(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.webImportService.listJobs(Number(page), Number(limit));
  }

  @Get('settings')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Configurações globais de importação web' })
  getSettings() {
    return this.webImportService.getSettings();
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Atualiza configurações globais de importação web' })
  updateSettings(@Body() dto: UpdateWebImportSettingsDto) {
    return this.webImportService.updateSettings(dto);
  }

  @Get(':jobId')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Detalhe de um job de importação web' })
  getJob(@Param('jobId') jobId: string) {
    return this.webImportService.getJob(jobId);
  }

  @Get(':jobId/pages')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Páginas descobertas/importadas de um job' })
  @ApiQuery({ name: 'status', required: false, enum: WebImportPageStatus })
  listPages(
    @Param('jobId') jobId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('status') status?: WebImportPageStatus,
  ) {
    return this.webImportService.listPages(jobId, Number(page), Number(limit), status);
  }

  @Get(':jobId/progress')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Snapshot de progresso do job' })
  getProgress(@Param('jobId') jobId: string) {
    return this.webImportService.getProgress(jobId);
  }

  @Get(':jobId/stream')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'SSE — progresso do job de importação web' })
  streamProgress(@Param('jobId') jobId: string, @Res() res: Response) {
    this.webImportService.streamProgress(jobId, res);
  }

  @Post(':jobId/cancel')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Cancela job de importação web' })
  cancelJob(@Param('jobId') jobId: string) {
    return this.webImportService.cancelJob(jobId);
  }

  @Post(':jobId/retry-failed')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Reenfileira páginas com falha' })
  retryFailed(@Param('jobId') jobId: string) {
    return this.webImportService.retryFailed(jobId);
  }
}
