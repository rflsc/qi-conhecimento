import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EngineeringSpecialty } from '@qi-conhecimento/shared-types';
import {
  KnowledgeDocumentEntity,
  KnowledgeDocumentModel,
} from '../schemas/knowledge-document.schema';
import {
  KnowledgeChunkDocument,
  KnowledgeChunkModel,
} from '../schemas/knowledge-chunk.schema';

@Injectable()
export class KnowledgeRepository {
  constructor(
    @InjectModel(KnowledgeDocumentModel.name)
    private readonly documentModel: Model<KnowledgeDocumentEntity>,
    @InjectModel(KnowledgeChunkModel.name)
    private readonly chunkModel: Model<KnowledgeChunkDocument>,
  ) {}

  createDocument(data: Partial<KnowledgeDocumentModel>): Promise<KnowledgeDocumentEntity> {
    return this.documentModel.create(data);
  }

  findDocuments(page: number, limit: number): Promise<[KnowledgeDocumentEntity[], number]> {
    return Promise.all([
      this.documentModel
        .find({ deletedAt: null })
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.documentModel.countDocuments({ deletedAt: null }).exec(),
    ]);
  }

  findDocumentById(id: string): Promise<KnowledgeDocumentEntity | null> {
    return this.documentModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  createChunk(data: Partial<KnowledgeChunkModel>): Promise<KnowledgeChunkDocument> {
    return this.chunkModel.create(data);
  }

  searchHybrid(query: string, specialty?: EngineeringSpecialty, limit = 5) {
    const filter: Record<string, unknown> = { deletedAt: null, $text: { $search: query } };
    if (specialty) filter['specialty'] = specialty;

    return this.chunkModel
      .find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .populate('documentId')
      .exec();
  }
}
