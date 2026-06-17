export const QUEUE_NAMES = {
  INGESTION: 'ingestion',
  EMBEDDING: 'embedding',
  MESSAGING: 'messaging',
} as const;

export const JOB_NAMES = {
  PROCESS_DOCUMENT: 'process-document',
  GENERATE_EMBEDDINGS: 'generate-embeddings',
  SEND_FIELD_RESPONSE: 'send-field-response',
} as const;
