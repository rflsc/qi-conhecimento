import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { EngineeringSpecialty, IngestionStatus, KnowledgeRetrievalScope } from '@qi-conhecimento/shared-types';
import { buildChunkRetrievalFilter } from '../utils/retrieval-scope.util';

/** Nome do índice Atlas Vector Search no campo `embedding` da coleção `knowledge_chunks`. */
export const KNOWLEDGE_VECTOR_INDEX = 'knowledge_vector_index';
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

  updateDocumentStatus(
    id: string,
    status: string,
    ingestionError?: string | null,
  ): Promise<KnowledgeDocumentEntity | null> {
    const update: Record<string, unknown> = { ingestionStatus: status };
    if (ingestionError !== undefined) {
      update['ingestionError'] = ingestionError;
    }
    return this.documentModel
      .findOneAndUpdate({ _id: id, deletedAt: null }, update, { new: true })
      .exec();
  }

  setParseQualityWarning(
    id: string,
    message: string,
    offerOcrRetry: boolean,
  ): Promise<KnowledgeDocumentEntity | null> {
    return this.documentModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { parseQualityWarning: message, offerOcrRetry },
        { new: true },
      )
      .exec();
  }

  clearOcrRetryOffer(id: string): Promise<KnowledgeDocumentEntity | null> {
    return this.documentModel
      .findOneAndUpdate({ _id: id, deletedAt: null }, { offerOcrRetry: false }, { new: true })
      .exec();
  }

  clearParseQualityFlags(id: string): Promise<KnowledgeDocumentEntity | null> {
    return this.documentModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $unset: { parseQualityWarning: '', offerOcrRetry: '' } },
        { new: true },
      )
      .exec();
  }

  findChunks(
    page: number,
    limit: number,
    documentId?: string,
  ): Promise<[KnowledgeChunkDocument[], number]> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (documentId) filter['documentId'] = documentId;

    return Promise.all([
      this.chunkModel
        .find(filter)
        .populate('documentId')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.chunkModel.countDocuments(filter).exec(),
    ]);
  }

  findChunksByIds(ids: string[]): Promise<KnowledgeChunkDocument[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.chunkModel
      .find({ _id: { $in: ids }, deletedAt: null })
      .populate('documentId')
      .exec();
  }

  findChunksWithEmbeddings(scope?: KnowledgeRetrievalScope): Promise<KnowledgeChunkDocument[]> {
    const filter: Record<string, unknown> = {
      ...buildChunkRetrievalFilter(scope),
      embedding: { $exists: true, $not: { $size: 0 } },
    };

    return this.chunkModel.find(filter).populate('documentId').select('+embedding').exec();
  }

  /**
   * Busca por similaridade usando o índice Atlas Vector Search (`$vectorSearch`).
   * Retorna apenas os ids ordenados por relevância — o conteúdo é re-hidratado depois
   * via `findChunksByIds` (que também filtra `deletedAt`).
   * Lança erro se o índice não existir/estiver indisponível (o chamador faz fallback).
   */
  async vectorSearch(
    queryEmbedding: number[],
    scope?: KnowledgeRetrievalScope,
    limit = 10,
  ): Promise<string[]> {
    const filter = buildChunkRetrievalFilter(scope);

    const pipeline: PipelineStage[] = [
      {
        $vectorSearch: {
          index: KNOWLEDGE_VECTOR_INDEX,
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: Math.max(limit * 10, 100),
          limit,
          filter,
        },
      } as unknown as PipelineStage,
      { $project: { _id: 1 } },
    ];

    const results = await this.chunkModel
      .aggregate<{ _id: Types.ObjectId }>(pipeline)
      .exec();
    return results.map((r) => r._id.toString());
  }

  countDocuments(): Promise<number> {
    return this.documentModel.countDocuments({ deletedAt: null }).exec();
  }

  countChunks(): Promise<number> {
    return this.chunkModel.countDocuments({ deletedAt: null }).exec();
  }

  countChunksWithEmbeddings(): Promise<number> {
    return this.chunkModel
      .countDocuments({
        deletedAt: null,
        embeddingId: { $exists: true, $ne: null },
      })
      .exec();
  }

  countChunkEmbeddingsByDocument(
    documentId: string,
  ): Promise<{ total: number; withEmbedding: number }> {
    const docObjectId = new Types.ObjectId(documentId);
    const filter = { documentId: docObjectId, deletedAt: null };
    return Promise.all([
      this.chunkModel.countDocuments(filter).exec(),
      this.chunkModel
        .countDocuments({ ...filter, embeddingId: { $exists: true, $ne: null } })
        .exec(),
    ]).then(([total, withEmbedding]) => ({ total, withEmbedding }));
  }

  findChunkIdsByDocument(documentId: string): Promise<string[]> {
    return this.chunkModel
      .find({ documentId, deletedAt: null })
      .select('_id')
      .exec()
      .then((chunks) => chunks.map((chunk) => chunk._id.toString()));
  }

  findAllChunkIdsByDocument(documentId: string): Promise<string[]> {
    const docObjectId = new Types.ObjectId(documentId);
    return this.chunkModel
      .find({ documentId: docObjectId })
      .select('_id')
      .exec()
      .then((chunks) => chunks.map((chunk) => chunk._id.toString()));
  }

  hardDeleteChunksByDocument(documentId: string): Promise<number> {
    const docObjectId = new Types.ObjectId(documentId);
    return this.chunkModel
      .deleteMany({ documentId: docObjectId })
      .exec()
      .then((result) => result.deletedCount ?? 0);
  }

  hardDeleteDocument(id: string): Promise<boolean> {
    return this.documentModel
      .deleteOne({ _id: id })
      .exec()
      .then((result) => (result.deletedCount ?? 0) > 0);
  }

  createChunk(data: Partial<KnowledgeChunkModel>): Promise<KnowledgeChunkDocument> {
    return this.chunkModel.create(data);
  }

  findChunkById(id: string): Promise<KnowledgeChunkDocument | null> {
    return this.chunkModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  isDocumentCancelled(documentId: string): Promise<boolean> {
    return this.documentModel
      .findOne({ _id: documentId, deletedAt: null })
      .select('ingestionStatus')
      .exec()
      .then((doc) => doc?.ingestionStatus === IngestionStatus.CANCELLED);
  }

  softDeleteChunksByDocument(documentId: string): Promise<number> {
    return this.chunkModel
      .updateMany({ documentId, deletedAt: null }, { deletedAt: new Date() })
      .exec()
      .then((result) => result.modifiedCount);
  }

  updateChunkEmbedding(
    id: string,
    embedding: number[],
    embeddingId?: string,
  ): Promise<KnowledgeChunkDocument | null> {
    return this.chunkModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { embedding, embeddingId: embeddingId ?? id },
        { new: true },
      )
      .exec();
  }

  async searchByText(query: string, scope?: KnowledgeRetrievalScope, limit = 5) {
    const baseFilter = buildChunkRetrievalFilter(scope);

    try {
      const filter: Record<string, unknown> = {
        ...baseFilter,
        $text: { $search: query },
      };

      return await this.chunkModel
        .find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .populate('documentId')
        .exec();
    } catch {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const filter: Record<string, unknown> = {
        ...baseFilter,
        $or: [
          { markdownContent: { $regex: escaped, $options: 'i' } },
          { content: { $regex: escaped, $options: 'i' } },
        ],
      };

      return this.chunkModel.find(filter).limit(limit).populate('documentId').exec();
    }
  }

  /** @deprecated Use RagService.hybridSearch */
  searchHybrid(query: string, scope?: KnowledgeRetrievalScope, limit = 5) {
    return this.searchByText(query, scope, limit);
  }
}
