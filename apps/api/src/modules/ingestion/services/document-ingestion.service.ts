import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { DocumentSourceType, IngestionStatus } from '@qi-conhecimento/shared-types';
import { stripMarkdownToPlain } from '@qi-conhecimento/shared-utils';
import { DomainEvents } from '@events/domain-events';
import { JOB_NAMES, QUEUE_NAMES } from '@queues/queues.constants';
import { KnowledgeRepository } from '@modules/knowledge/repositories/knowledge.repository';
import { ParserFactory } from '../parsers/parser.factory';
import { ChunkingService } from './chunking.service';
import { StorageService } from './storage.service';
import { IngestionProgressService } from './ingestion-progress.service';

@Injectable()
export class DocumentIngestionService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly storageService: StorageService,
    private readonly parserFactory: ParserFactory,
    private readonly chunkingService: ChunkingService,
    private readonly eventEmitter: EventEmitter2,
    private readonly progressService: IngestionProgressService,
    @InjectQueue(QUEUE_NAMES.INGESTION) private readonly ingestionQueue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DocumentIngestionService.name);
  }

  async processDocument(documentId: string): Promise<void> {
    if (await this.knowledgeRepository.isDocumentCancelled(documentId)) {
      this.logger.info({ documentId }, 'Ingestão cancelada — ignorando job');
      return;
    }

    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) {
      this.logger.warn({ documentId }, 'Documento não encontrado para ingestão');
      return;
    }

    await this.knowledgeRepository.updateDocumentStatus(documentId, IngestionStatus.PROCESSING);
    this.progressService.setStatus(documentId, IngestionStatus.PROCESSING);
    this.progressService.setPhase(documentId, 'loading_source', 'Carregando fonte do documento');

    try {
      const rawInput = await this.loadSource(document.sourceType, document.sourceReference);
      this.progressService.setPhase(
        documentId,
        'parsing',
        `Iniciando parse (${document.sourceType}) — aguarde, pode levar alguns minutos`,
      );

      const parser = this.parserFactory.getParser(document.sourceType);
      const parseStarted = Date.now();
      const { markdown } = await parser.parse(rawInput);
      const parseSeconds = ((Date.now() - parseStarted) / 1000).toFixed(1);

      this.progressService.setPhase(
        documentId,
        'parsing',
        `Parse concluído em ${parseSeconds}s — ${markdown.length.toLocaleString('pt-BR')} caracteres extraídos`,
        'success',
      );

      if (await this.knowledgeRepository.isDocumentCancelled(documentId)) {
        this.logger.info({ documentId }, 'Ingestão cancelada após parse — abortando');
        return;
      }

      if (!markdown.trim()) {
        throw new Error('Parser não extraiu conteúdo');
      }

      const segments = this.chunkingService.splitMarkdown(markdown, document.title);
      const tags = document.normReference ? [document.normReference.toLowerCase()] : [];
      this.progressService.setTotalChunks(documentId, segments.length);
      this.progressService.setPhase(documentId, 'chunking', 'Dividindo conteúdo em pílulas de conhecimento');

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (await this.knowledgeRepository.isDocumentCancelled(documentId)) {
          this.logger.info({ documentId }, 'Ingestão cancelada durante chunking — abortando');
          return;
        }

        const chunk = await this.knowledgeRepository.createChunk({
          documentId: document._id,
          content: stripMarkdownToPlain(segment.markdownContent),
          markdownContent: segment.markdownContent,
          specialty: document.specialty,
          tags,
          chapter: segment.chapter,
          section: segment.section,
          normItem: segment.normItem,
          deletedAt: null,
        });

        await this.ingestionQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, {
          chunkId: chunk._id.toString(),
        });

        this.progressService.chunkCreated(documentId, i + 1, segments.length);
      }

      if (segments.length > 0) {
        this.progressService.setPhase(
          documentId,
          'embedding',
          `${segments.length} job(s) de embedding enfileirado(s)`,
        );
      }

      await this.knowledgeRepository.updateDocumentStatus(documentId, IngestionStatus.COMPLETED);

      if (segments.length === 0) {
        this.progressService.complete(documentId, 'Documento processado sem pílulas geradas');
      } else {
        this.progressService.setPhase(
          documentId,
          'embedding',
          `Parse e chunking concluídos — aguardando ${segments.length} embedding(s) na fila`,
          'success',
        );
      }
      this.eventEmitter.emit(DomainEvents.DOCUMENT_PROCESSED, { documentId });
      this.logger.info({ documentId, chunks: segments.length }, 'Documento processado');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido na ingestão';
      await this.knowledgeRepository.updateDocumentStatus(
        documentId,
        IngestionStatus.FAILED,
        message,
      );
      this.progressService.fail(documentId, message);
      this.logger.error({ documentId, error: message }, 'Falha na ingestão');
      throw error;
    }
  }

  async generateEmbedding(chunkId: string): Promise<void> {
    await this.ingestionQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, { chunkId });
  }

  private async loadSource(
    sourceType: DocumentSourceType,
    sourceReference?: string,
  ): Promise<Buffer | string> {
    if (!sourceReference) {
      throw new Error('Referência de fonte ausente');
    }

    if (sourceType === DocumentSourceType.LINK || sourceType === DocumentSourceType.HTML) {
      return this.storageService.fetchUrl(sourceReference);
    }

    return this.storageService.readFile(sourceReference);
  }
}
