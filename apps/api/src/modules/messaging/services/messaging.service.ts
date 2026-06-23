import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvents } from '@events/domain-events';
import { MessagingChannel } from '@qi-conhecimento/shared-types';
import { RagService } from '@modules/knowledge/services/rag.service';
import { KnowledgeRepository } from '@modules/knowledge/repositories/knowledge.repository';
import { mergeRetrievalScope } from '@modules/knowledge/utils/retrieval-scope.util';
import {
  buildPdfAttachmentsFromCitations,
  enrichAnswerWithSourceLinks,
  resolveChunkSourceUrl,
} from '@modules/knowledge/utils/source-url.util';
import { FieldQueryDto } from '../dtos/messaging.dto';
import { MessagingRepository } from '../repositories/messaging.repository';
import { FieldQueryDocument } from '../schemas/field-query.schema';
import { KnowledgeChunkDocument } from '@modules/knowledge/schemas/knowledge-chunk.schema';
import { KnowledgeDocumentEntity } from '@modules/knowledge/schemas/knowledge-document.schema';

@Injectable()
export class MessagingService {
  constructor(
    private readonly messagingRepository: MessagingRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly ragService: RagService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleFieldQuery(dto: FieldQueryDto) {
    const { channel, externalUserId } = this.resolveFieldQueryContext(dto);
    const scope = mergeRetrievalScope(dto.specialtyFilter, {
      tags: dto.tagFilter,
      documentIds: dto.documentIds,
    });

    const chunks = await this.ragService.retrieveChunksForAnswer(dto.queryText, scope);

    const citations = this.ragService
      .selectCitationsForDisplay(chunks, dto.queryText, 5, scope)
      .map((chunk) => this.toCitation(chunk));
    const rawAnswer = await this.ragService.generateAnswer(dto.queryText, chunks);
    const answer = enrichAnswerWithSourceLinks(rawAnswer, citations);
    const attachments = buildPdfAttachmentsFromCitations(citations);

    const record = await this.messagingRepository.create({
      channel,
      externalUserId,
      queryText: dto.queryText,
      transcribedFromAudio: dto.transcribedFromAudio ?? false,
      specialtyFilter: dto.specialtyFilter,
      answer,
      citations,
      attachments: attachments.length > 0 ? attachments : undefined,
      deletedAt: null,
    });

    this.eventEmitter.emit(DomainEvents.FIELD_QUERY_ANSWERED, {
      queryId: record._id.toString(),
      channel,
    });

    return record;
  }

  async listFieldQueries(page = 1, limit = 20) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;
    const [data, total] = await this.messagingRepository.findPaginated(safePage, safeLimit);
    return {
      data: data.map((record) => this.toFieldQueryRow(record)),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  verifyWhatsApp(mode: string, token: string, challenge: string, verifyToken: string) {
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    return null;
  }

  /** Defaults quando Qi Agents não injeta contextInject (endpoint desatualizado). */
  private resolveFieldQueryContext(dto: FieldQueryDto): {
    channel: MessagingChannel;
    externalUserId: string;
  } {
    return {
      channel: dto.channel ?? MessagingChannel.ADMIN,
      externalUserId: dto.externalUserId?.trim() || 'qi-agents',
    };
  }

  private toFieldQueryRow(record: FieldQueryDocument) {
    return {
      id: record._id.toString(),
      channel: record.channel,
      externalUserId: record.externalUserId,
      queryText: record.queryText,
      transcribedFromAudio: record.transcribedFromAudio,
      specialtyFilter: record.specialtyFilter,
      answer: record.answer,
      citations: record.citations ?? [],
      attachments: record.attachments ?? [],
      createdAt: (record as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? null,
    };
  }

  private toCitation(chunk: KnowledgeChunkDocument) {
    const document = chunk.documentId as unknown as KnowledgeDocumentEntity;
    return {
      documentId: document._id.toString(),
      documentTitle: document.title,
      normReference: document.normReference,
      normItem: chunk.normItem,
      chunkId: chunk._id.toString(),
      excerpt: chunk.markdownContent.slice(0, 280),
      sourceUrl: resolveChunkSourceUrl(chunk, document),
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      tableCaption: chunk.tableCaption,
    };
  }
}
