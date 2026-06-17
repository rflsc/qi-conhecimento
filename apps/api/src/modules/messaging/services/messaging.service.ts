import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { buildCitationLabel } from '@qi-conhecimento/shared-utils';
import { DomainEvents } from '@events/domain-events';
import { KnowledgeRepository } from '@modules/knowledge/repositories/knowledge.repository';
import { FieldQueryDto } from '../dtos/messaging.dto';
import { MessagingRepository } from '../repositories/messaging.repository';
import { KnowledgeChunkDocument } from '@modules/knowledge/schemas/knowledge-chunk.schema';
import { KnowledgeDocumentEntity } from '@modules/knowledge/schemas/knowledge-document.schema';

@Injectable()
export class MessagingService {
  constructor(
    private readonly messagingRepository: MessagingRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleFieldQuery(dto: FieldQueryDto) {
    const chunks = await this.knowledgeRepository.searchHybrid(
      dto.queryText,
      dto.specialtyFilter,
      3,
    );

    const citations = chunks.map((chunk) => this.toCitation(chunk));
    const answer = this.buildAnswer(dto.queryText, citations);

    const record = await this.messagingRepository.create({
      channel: dto.channel,
      externalUserId: dto.externalUserId,
      queryText: dto.queryText,
      transcribedFromAudio: dto.transcribedFromAudio ?? false,
      specialtyFilter: dto.specialtyFilter,
      answer,
      citations,
      deletedAt: null,
    });

    this.eventEmitter.emit(DomainEvents.FIELD_QUERY_ANSWERED, {
      queryId: record._id.toString(),
      channel: dto.channel,
    });

    return record;
  }

  verifyWhatsApp(mode: string, token: string, challenge: string, verifyToken: string) {
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    return null;
  }

  private buildAnswer(
    query: string,
    citations: Array<{ normReference?: string; normItem?: string; excerpt: string }>,
  ): string {
    if (!citations.length) {
      return `Não encontrei referência técnica para "${query}". Verifique a especialidade ou consulte o administrador.`;
    }

    const primary = citations[0];
    const label = buildCitationLabel(primary?.normReference, primary?.normItem);
    return `Conforme ${label}: ${primary?.excerpt ?? 'consulte a fonte original para validação.'}`;
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
      sourceUrl: document.sourceReference,
    };
  }
}
