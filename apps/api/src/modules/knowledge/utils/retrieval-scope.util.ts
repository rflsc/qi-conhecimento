import { Types } from 'mongoose';
import { EngineeringSpecialty, KnowledgeRetrievalScope } from '@qi-conhecimento/shared-types';

export function normalizeRetrievalTags(tags?: string[]): string[] {
  if (!tags?.length) return [];
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function buildChunkRetrievalFilter(
  scope?: KnowledgeRetrievalScope,
): Record<string, unknown> {
  const filter: Record<string, unknown> = { deletedAt: null };

  if (scope?.specialty) {
    filter['specialty'] = scope.specialty;
  }

  const documentIds = scope?.documentIds?.map((id: string) => id.trim()).filter(Boolean) ?? [];
  if (documentIds.length > 0) {
    filter['documentId'] = { $in: documentIds.map((id: string) => new Types.ObjectId(id)) };
  }

  const tags = normalizeRetrievalTags(scope?.tags);
  if (tags.length > 0) {
    filter['tags'] = { $in: tags };
  }

  return filter;
}

export function chunkMatchesScopeTags(
  chunkTags: string[] | undefined,
  scopeTags?: string[],
): boolean {
  const normalizedChunk = normalizeRetrievalTags(chunkTags);
  const normalizedScope = normalizeRetrievalTags(scopeTags);
  if (!normalizedScope.length) return false;
  return normalizedScope.some((tag) => normalizedChunk.includes(tag));
}

/** Escopo restrito a tags ou documentos — sem inferência por texto da pergunta. */
export function isRetrievalScopeRestricted(scope?: KnowledgeRetrievalScope): boolean {
  return !!(scope?.tags?.length || scope?.documentIds?.length);
}

export function mergeRetrievalScope(
  specialty?: EngineeringSpecialty,
  scope?: KnowledgeRetrievalScope,
): KnowledgeRetrievalScope | undefined {
  const merged: KnowledgeRetrievalScope = {
    specialty: scope?.specialty ?? specialty,
    tags: scope?.tags?.length ? scope.tags : undefined,
    documentIds: scope?.documentIds?.length ? scope.documentIds : undefined,
  };

  if (!merged.specialty && !merged.tags?.length && !merged.documentIds?.length) {
    return undefined;
  }

  return merged;
}
