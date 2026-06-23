export const QUEUE_NAMES = {
  INGESTION: 'ingestion',
  EMBEDDING: 'embedding',
  WEB_IMPORT: 'web-import',
} as const;

/** Reduces idle Redis polling — recommended for Upstash pay-per-command. */
export const BULLMQ_WORKER_SETTINGS = {
  drainDelay: 30_000,
  stalledInterval: 300_000,
} as const;

export const JOB_NAMES = {
  PROCESS_DOCUMENT: 'process-document',
  GENERATE_EMBEDDINGS: 'generate-embeddings',
  RUN_WEB_IMPORT: 'run-web-import',
  PROCESS_WEB_IMPORT_PAGE: 'process-web-import-page',
} as const;
