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
import { assessParseQuality } from '../utils/parse-quality.util';

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

  async processDocument(
    documentId: string,
    options?: { allowWeakParserFallback?: boolean; doOcr?: boolean },
  ): Promise<void> {
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
    this.progressService.setPhase(documentId, 'loading_source', 'Carregando arquivo do documento…');

    try {
      const rawInput = await this.loadSource(document.sourceType, document.sourceReference);
      const sourceLabel = this.describeSourceSize(rawInput);
      this.progressService.setPhase(
        documentId,
        'loading_source',
        `Fonte carregada (${sourceLabel})`,
        'success',
      );

      const parser = this.parserFactory.getParser(document.sourceType);
      const usesDocling = document.sourceType === DocumentSourceType.PDF;
      if (options?.doOcr && usesDocling) {
        this.progressService.setPhase(
          documentId,
          'parsing',
          'Reprocessando com OCR — pode levar bem mais tempo que o parse normal',
          'info',
        );
      } else {
        this.progressService.setPhase(
          documentId,
          'parsing',
          usesDocling
            ? 'Extraindo conteúdo com Docling — PDFs grandes podem levar vários minutos'
            : `Extraindo conteúdo (${document.sourceType})`,
        );
      }

      const parseStarted = Date.now();
      const stopParseHeartbeat = this.progressService.startActivityHeartbeat(
        documentId,
        'parsing',
        options?.doOcr && usesDocling ? 'Docling com OCR em execução' : usesDocling ? 'Docling em execução' : 'Parser em execução',
      );

      let markdown: string;
      let parserEngine: string | undefined;
      try {
        const parseResult = await parser.parse(rawInput, {
          allowWeakParserFallback: options?.allowWeakParserFallback,
          doOcr: options?.doOcr,
        });
        markdown = parseResult.markdown;
        parserEngine = parseResult.engine;
        if (parseResult.engine) {
          this.progressService.setParserEngine(documentId, parseResult.engine);
        }
        if (parseResult.usedWeakFallback) {
          this.progressService.setPhase(
            documentId,
            'parsing',
            'Docling indisponível — continuando com pdf-parse (qualidade inferior, conforme solicitado)',
            'warn',
          );
        }
        if (parseResult.title && !document.title.trim()) {
          this.logger.info({ documentId, title: parseResult.title }, 'Título sugerido pelo parser');
        }
      } finally {
        stopParseHeartbeat();
      }
      const parseSeconds = ((Date.now() - parseStarted) / 1000).toFixed(1);
      const engineLabel = parserEngine ? ` via ${parserEngine}` : '';

      this.progressService.setPhase(
        documentId,
        'parsing',
        `Texto extraído em ${parseSeconds}s${engineLabel} — ${markdown.length.toLocaleString('pt-BR')} caracteres`,
        'success',
      );

      const parseQuality = assessParseQuality({
        sourceType: document.sourceType,
        rawInput,
        extractedChars: markdown.length,
      });

      if (parseQuality.suspicious && parseQuality.message) {
        const offerOcrRetry =
          usesDocling && !options?.doOcr && document.sourceType === DocumentSourceType.PDF;
        const warningMessage =
          options?.doOcr && !offerOcrRetry
            ? `${parseQuality.message} OCR já foi tentado neste documento.`
            : parseQuality.message;

        await this.knowledgeRepository.setParseQualityWarning(
          documentId,
          warningMessage,
          offerOcrRetry,
        );
        this.progressService.setParseQualityWarning(documentId, warningMessage, offerOcrRetry);
        this.logger.warn(
          { documentId, extractedChars: markdown.length, sourceType: document.sourceType, doOcr: options?.doOcr },
          'Extração de texto suspeitamente baixa',
        );
      } else {
        await this.knowledgeRepository.clearParseQualityFlags(documentId);
        this.progressService.clearParseQualityFlags(documentId);
      }

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
      this.progressService.setPhase(
        documentId,
        'chunking',
        segments.length > 0
          ? `Dividindo em pílulas de conhecimento (${segments.length} segmentos)`
          : 'Nenhum segmento gerado pelo chunking',
      );

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
          `Fila de embeddings: ${segments.length} job(s) — etapa mais demorada (55% → 100%)`,
        );
      }

      await this.knowledgeRepository.updateDocumentStatus(documentId, IngestionStatus.COMPLETED);

      if (segments.length === 0) {
        this.progressService.complete(documentId, 'Documento processado sem pílulas geradas');
      } else {
        this.progressService.setPhase(
          documentId,
          'embedding',
          `Parse e pílulas prontos — gerando embeddings (0/${segments.length})`,
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

  private describeSourceSize(rawInput: Buffer | string): string {
    if (Buffer.isBuffer(rawInput)) {
      const mb = rawInput.length / (1024 * 1024);
      return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(rawInput.length / 1024)} KB`;
    }
    return `${rawInput.length.toLocaleString('pt-BR')} caracteres`;
  }
}
