import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { IngestionStatus } from '@qi-conhecimento/shared-types';
import { DomainEvents } from '@events/domain-events';
import { JOB_NAMES, QUEUE_NAMES } from '@queues/queues.constants';
import {
  CreateKnowledgeDocumentDto,
  CreateManualContentDto,
  SearchKnowledgeDto,
} from '../dtos/knowledge.dto';
import { KnowledgeRepository } from '../repositories/knowledge.repository';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.INGESTION) private readonly ingestionQueue: Queue,
  ) {}

  async createDocument(dto: CreateKnowledgeDocumentDto) {
    const document = await this.knowledgeRepository.createDocument({
      ...dto,
      ingestionStatus: IngestionStatus.PENDING,
      deletedAt: null,
    });

    await this.ingestionQueue.add(JOB_NAMES.PROCESS_DOCUMENT, {
      documentId: document._id.toString(),
    });

    this.eventEmitter.emit(DomainEvents.DOCUMENT_INGESTED, {
      documentId: document._id.toString(),
    });

    return document;
  }

  async createManualContent(dto: CreateManualContentDto) {
    const document = await this.knowledgeRepository.findDocumentById(dto.documentId);
    if (!document) throw new NotFoundException('Document not found');

    const chunk = await this.knowledgeRepository.createChunk({
      documentId: new Types.ObjectId(dto.documentId),
      content: dto.markdownContent.replace(/[#*`]/g, ''),
      markdownContent: dto.markdownContent,
      specialty: dto.specialty,
      tags: dto.tags ?? [],
      chapter: dto.title,
      deletedAt: null,
    });

    await this.ingestionQueue.add(JOB_NAMES.GENERATE_EMBEDDINGS, {
      chunkId: chunk._id.toString(),
    });

    return chunk;
  }

  async listDocuments(page: number, limit: number) {
    const [data, total] = await this.knowledgeRepository.findDocuments(page, limit);
    return { data, total, page, limit };
  }

  async search(dto: SearchKnowledgeDto) {
    return this.knowledgeRepository.searchHybrid(dto.query, dto.specialty);
  }
}
