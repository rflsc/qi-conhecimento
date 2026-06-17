import { EngineeringSpecialty, IngestionStatus } from '@qi-conhecimento/shared-types';
import { KnowledgeDocumentEntity } from '../schemas/knowledge-document.schema';
import { KnowledgeChunkDocument } from '../schemas/knowledge-chunk.schema';

type WithTimestamps = { createdAt?: Date; updatedAt?: Date };

export function mapDocument(doc: KnowledgeDocumentEntity) {
  const timestamps = doc as KnowledgeDocumentEntity & WithTimestamps;
  return {
    id: doc._id.toString(),
    title: doc.title,
    specialty: doc.specialty,
    sourceType: doc.sourceType,
    sourceReference: doc.sourceReference,
    normReference: doc.normReference,
    author: doc.author,
    ingestionStatus: doc.ingestionStatus,
    ingestionError: doc.ingestionError,
    createdAt: timestamps.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: timestamps.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapChunk(chunk: KnowledgeChunkDocument) {
  const document = chunk.documentId as unknown as KnowledgeDocumentEntity | undefined;
  const timestamps = chunk as KnowledgeChunkDocument & WithTimestamps;
  return {
    id: chunk._id.toString(),
    documentId: document?._id?.toString() ?? chunk.documentId.toString(),
    documentTitle: document?.title,
    normReference: document?.normReference,
    content: chunk.content,
    markdownContent: chunk.markdownContent,
    specialty: chunk.specialty,
    chapter: chunk.chapter,
    section: chunk.section,
    normItem: chunk.normItem,
    tags: chunk.tags,
    hasEmbedding: Boolean(chunk.embeddingId),
    createdAt: timestamps.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapSearchResult(chunk: KnowledgeChunkDocument) {
  const document = chunk.documentId as unknown as KnowledgeDocumentEntity;
  return {
    chunkId: chunk._id.toString(),
    documentId: document._id.toString(),
    documentTitle: document.title,
    normReference: document.normReference,
    normItem: chunk.normItem,
    specialty: chunk.specialty as EngineeringSpecialty,
    excerpt: chunk.markdownContent.slice(0, 400),
    tags: chunk.tags,
  };
}

export function mapCitation(chunk: KnowledgeChunkDocument) {
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

export { IngestionStatus };
