const MAX_EMBEDDING_CONCURRENCY = 20;

/** Concorrência do worker BullMQ de embeddings (lida na subida do processo). */
export function getEmbeddingWorkerConcurrency(): number {
  const raw = process.env.EMBEDDING_CONCURRENCY?.trim();
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(parsed, MAX_EMBEDDING_CONCURRENCY);
    }
  }

  const provider = process.env.EMBEDDING_PROVIDER?.toLowerCase();
  if (provider === 'ollama') return 2;
  if (provider === 'openai') return 5;
  return process.env.OPENAI_API_KEY?.trim() ? 5 : 2;
}
