import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { DocumentSourceType, IngestionStatus, ParseBlock } from '@qi-conhecimento/shared-types';
import { stripMarkdownToPlain, inferChunkTagsFromDocument } from '@qi-conhecimento/shared-utils';
import { DomainEvents } from '@events/domain-events';
import { JOB_NAMES, QUEUE_NAMES } from '@queues/queues.constants';
import { KnowledgeRepository } from '@modules/knowledge/repositories/knowledge.repository';
import { ParserFactory } from '../parsers/parser.factory';
import { ChunkingService } from './chunking.service';
import { StorageService } from './storage.service';
import { IngestionProgressService } from './ingestion-progress.service';
import { ChunkSegment } from '../parsers/parser.interface';
import { assessParseQuality } from '../utils/parse-quality.util';
import type { KnowledgeDocumentEntity } from '@modules/knowledge/schemas/knowledge-document.schema';

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
    @InjectQueue(QUEUE_NAMES.EMBEDDING) private readonly embeddingQueue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DocumentIngestionService.name);
  }

  async processDocument(
    documentId: string,
    options?: { allowWeakParserFallback?: boolean; doOcr?: boolean; cmsTags?: string[] },
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

    try {
      if (document.sourceType === DocumentSourceType.MANUAL_TEXT) {
        await this.processMarkdownDocument(documentId, document, options?.cmsTags);
        return;
      }

      this.progressService.setPhase(documentId, 'loading_source', 'Carregando arquivo do documento…');
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
      const isWebSource =
        document.sourceType === DocumentSourceType.LINK ||
        document.sourceType === DocumentSourceType.HTML;
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
      let parseBlocks: ParseBlock[] | undefined;
      let usedWeakFallback = false;
      try {
        const parseResult = await parser.parse(rawInput, {
          allowWeakParserFallback: options?.allowWeakParserFallback,
          doOcr: options?.doOcr,
          sourceUrl: isWebSource ? document.sourceReference : undefined,
          onParseProgress: usesDocling
            ? (update) => this.progressService.updateParsePageProgress(documentId, update)
            : undefined,
        });
        markdown = parseResult.markdown;
        parserEngine = parseResult.engine;
        parseBlocks = parseResult.blocks;
        usedWeakFallback = parseResult.usedWeakFallback === true;
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
        this.progressService.clearParsePageProgress(documentId);
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

      const blockSegments =
        parseBlocks?.length && !usedWeakFallback
          ? this.chunkingService.splitFromBlocks(parseBlocks, document.title)
          : [];
      const segments =
        blockSegments.length > 0
          ? blockSegments
          : this.chunkingService.splitMarkdown(markdown, document.title);
      const webSourceUrl = isWebSource ? document.sourceReference?.trim() : undefined;
      const segmentsWithUrl =
        webSourceUrl && /^https?:\/\//i.test(webSourceUrl)
          ? segments.map((segment) => ({ ...segment, sourceUrl: webSourceUrl }))
          : segments;
      const tags = this.buildChunkTags(document, options?.cmsTags);
      await this.persistSegments(documentId, document, segmentsWithUrl, tags, 'Parse e pílulas prontos');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido na ingestão';
      await this.knowledgeRepository.updateDocumentStatus(
        documentId,
        IngestionStatus.FAILED,
        message,
      );
      this.progressService.fail(documentId, message);
      this.logger.error({ documentId, error: message }, 'Falha na ingestão');
      this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTION_FINISHED, {
        documentId,
        status: IngestionStatus.FAILED,
        error: message,
      });
      throw error;
    }
  }

  /** Adiciona pílulas de uma página web ao documento agregado de um job de importação. */
  async appendWebImportPage(
    documentId: string,
    pageUrl: string,
    pageTitle: string | undefined,
    cmsTags?: string[],
  ): Promise<number> {
    if (await this.knowledgeRepository.isDocumentCancelled(documentId)) {
      throw new Error('Documento cancelado');
    }

    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) {
      throw new Error('Documento não encontrado');
    }

    if (document.ingestionStatus === IngestionStatus.PENDING) {
      await this.knowledgeRepository.updateDocumentStatus(documentId, IngestionStatus.PROCESSING);
    }

    const rawInput = await this.storageService.fetchUrl(pageUrl);
    const parser = this.parserFactory.getParser(DocumentSourceType.LINK);
    const heading = pageTitle?.trim() || pageUrl;

    const parseResult = await parser.parse(rawInput, { sourceUrl: pageUrl });
    const blockSegments =
      parseResult.blocks?.length && !parseResult.usedWeakFallback
        ? this.chunkingService.splitFromBlocks(parseResult.blocks, heading)
        : [];
    const segments =
      blockSegments.length > 0
        ? blockSegments
        : this.chunkingService.splitMarkdown(parseResult.markdown, heading);

    const segmentsWithUrl = segments.map((segment) => ({
      ...segment,
      sourceUrl: pageUrl,
    }));

    if (segmentsWithUrl.length === 0) {
      throw new Error('Parser não extraiu conteúdo');
    }

    const tags = this.buildChunkTags(document, cmsTags);
    return this.createChunks(document, segmentsWithUrl, tags);
  }

  async finalizeWebImportDocument(documentId: string, hadSuccessfulPages: boolean): Promise<void> {
    const status = hadSuccessfulPages ? IngestionStatus.COMPLETED : IngestionStatus.FAILED;
    const message = hadSuccessfulPages ? undefined : 'Nenhuma página importada com sucesso';

    await this.knowledgeRepository.updateDocumentStatus(documentId, status, message);

    if (hadSuccessfulPages) {
      this.eventEmitter.emit(DomainEvents.DOCUMENT_PROCESSED, { documentId });
      this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTION_FINISHED, {
        documentId,
        status: IngestionStatus.COMPLETED,
      });
    } else {
      this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTION_FINISHED, {
        documentId,
        status: IngestionStatus.FAILED,
        error: message,
      });
    }
  }

  private async processMarkdownDocument(
    documentId: string,
    document: KnowledgeDocumentEntity,
    cmsTags?: string[],
  ): Promise<void> {
    this.progressService.setPhase(documentId, 'loading_source', 'Carregando Markdown…');

    const rawInput = await this.loadSource(document.sourceType, document.sourceReference);
    const markdown = Buffer.isBuffer(rawInput) ? rawInput.toString('utf-8') : rawInput;

    this.progressService.setPhase(
      documentId,
      'loading_source',
      `Markdown carregado (${markdown.length.toLocaleString('pt-BR')} caracteres)`,
      'success',
    );

    if (await this.knowledgeRepository.isDocumentCancelled(documentId)) {
      this.logger.info({ documentId }, 'Ingestão cancelada — abortando');
      return;
    }

    if (!markdown.trim()) {
      throw new Error('Markdown vazio');
    }

    const segments = this.chunkingService.splitMarkdown(markdown, document.title);
    const tags = this.buildChunkTags(document, cmsTags);
    await this.persistSegments(documentId, document, segments, tags, 'Chunking concluído');
  }

  private buildChunkTags(document: KnowledgeDocumentEntity, extraTags?: string[]): string[] {
    return inferChunkTagsFromDocument({
      normReference: document.normReference,
      extraTags,
    });
  }

  private async persistSegments(
    documentId: string,
    document: KnowledgeDocumentEntity,
    segments: ChunkSegment[],
    tags: string[],
    embeddingReadyMessage: string,
  ): Promise<void> {
    this.progressService.setTotalChunks(documentId, segments.length);
    this.progressService.setPhase(
      documentId,
      'chunking',
      segments.length > 0
        ? `Dividindo em pílulas de conhecimento (${segments.length} segmentos)`
        : 'Nenhum segmento gerado pelo chunking',
    );

    const chunkIds: string[] = [];

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
        pageStart: segment.pageStart,
        pageEnd: segment.pageEnd,
        contentType: segment.contentType,
        headingPath: segment.headingPath,
        tableCaption: segment.tableCaption,
        tableSource: segment.tableSource,
        sourceUrl: segment.sourceUrl,
        deletedAt: null,
      });

      chunkIds.push(chunk._id.toString());

      this.progressService.chunkCreated(documentId, i + 1, segments.length, {
        chapter: segment.chapter,
        section: segment.section,
        normItem: segment.normItem,
      });
    }

    if (chunkIds.length > 0) {
      await this.embeddingQueue.addBulk(
        chunkIds.map((chunkId) => ({
          name: JOB_NAMES.GENERATE_EMBEDDINGS,
          data: { chunkId },
        })),
      );
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
        `${embeddingReadyMessage} — gerando embeddings (0/${segments.length})`,
        'success',
      );
      this.progressService.startEmbeddingSync(documentId);
    }

    this.eventEmitter.emit(DomainEvents.DOCUMENT_PROCESSED, { documentId });
    this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTION_FINISHED, {
      documentId,
      status: IngestionStatus.COMPLETED,
    });
    this.logger.info({ documentId, chunks: segments.length }, 'Documento processado');
  }

  private async createChunks(
    document: KnowledgeDocumentEntity,
    segments: ChunkSegment[],
    tags: string[],
  ): Promise<number> {
    const documentId = document._id.toString();
    const chunkIds: string[] = [];

    for (const segment of segments) {
      if (await this.knowledgeRepository.isDocumentCancelled(documentId)) {
        throw new Error('Documento cancelado durante chunking');
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
        pageStart: segment.pageStart,
        pageEnd: segment.pageEnd,
        contentType: segment.contentType,
        headingPath: segment.headingPath,
        tableCaption: segment.tableCaption,
        tableSource: segment.tableSource,
        sourceUrl: segment.sourceUrl,
        deletedAt: null,
      });

      chunkIds.push(chunk._id.toString());
    }

    if (chunkIds.length > 0) {
      await this.embeddingQueue.addBulk(
        chunkIds.map((chunkId) => ({
          name: JOB_NAMES.GENERATE_EMBEDDINGS,
          data: { chunkId },
        })),
      );
    }

    return chunkIds.length;
  }

  async generateEmbedding(chunkId: string): Promise<void> {
    await this.embeddingQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, { chunkId });
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
