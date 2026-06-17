export const DomainEvents = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  DOCUMENT_INGESTED: 'document.ingested',
  DOCUMENT_PROCESSED: 'document.processed',
  CHUNK_INDEXED: 'chunk.indexed',
  FIELD_QUERY_ANSWERED: 'field.query.answered',
} as const;

export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];
