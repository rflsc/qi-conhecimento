import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import {
  IngestionLogEntry,
  IngestionLogLevel,
  IngestionPhase,
  IngestionProgress,
  IngestionStatus,
} from '@qi-conhecimento/shared-types';
import { DomainEvents } from '@events/domain-events';
import { KnowledgeRepository } from '@modules/knowledge/repositories/knowledge.repository';

const MAX_LOGS = 300;
const CHUNK_LOG_STEP_SMALL = 10;
const CHUNK_LOG_STEP_MEDIUM = 20;
const CHUNK_LOG_STEP_LARGE = 25;
const EMBEDDING_LOG_STEP_SMALL = 5;
const EMBEDDING_LOG_STEP_MEDIUM = 10;
const EMBEDDING_LOG_STEP_LARGE = 25;
const PARSER_HEARTBEAT_MS = 10_000;
const PHASE_BASE_PERCENT: Record<IngestionPhase, number> = {
  queued: 0,
  loading_source: 5,
  parsing: 15,
  chunking: 35,
  embedding: 55,
  completed: 100,
  failed: 0,
  cancelled: 0,
};

type ProgressListener = (progress: IngestionProgress) => void;

@Injectable()
export class IngestionProgressService {
  private readonly store = new Map<string, IngestionProgress>();
  private readonly listeners = new Map<string, Set<ProgressListener>>();
  private readonly activityHeartbeats = new Map<string, ReturnType<typeof setInterval>>();
  private readonly embeddingLogMilestone = new Map<string, number>();

  constructor(private readonly knowledgeRepository: KnowledgeRepository) {}

  @OnEvent(DomainEvents.DOCUMENT_INGESTED)
  handleDocumentIngested(payload: { documentId: string }): void {
    this.init(payload.documentId);
    this.appendLog(payload.documentId, 'info', 'queued', 'Documento enfileirado para ingestão');
  }

  @OnEvent(DomainEvents.CHUNK_INDEXED)
  async handleChunkIndexed(payload: { chunkId: string; documentId?: string }): Promise<void> {
    const documentId =
      payload.documentId ??
      (await this.knowledgeRepository.findChunkById(payload.chunkId))?.documentId.toString();
    if (!documentId) return;

    const counts = await this.knowledgeRepository.countChunkEmbeddingsByDocument(documentId);
    const state = this.ensure(documentId);
    state.embeddingsDone = counts.withEmbedding;
    state.totalChunks = Math.max(state.totalChunks, counts.total);
    state.embeddingsQueued = state.totalChunks;
    const allDone = state.totalChunks > 0 && state.embeddingsDone >= state.totalChunks;
    state.phase = allDone ? 'completed' : 'embedding';
    state.percent = this.computePercent(state);
    state.estimatedSecondsRemaining = allDone ? 0 : this.estimateRemaining(state);

    if (allDone) {
      this.embeddingLogMilestone.delete(documentId);
      this.complete(
        documentId,
        `Ingestão finalizada — ${state.embeddingsDone} embedding(s) em ${state.totalChunks} pílula(s)`,
      );
      return;
    }

    if (this.shouldLogEmbeddingProgress(documentId, state.embeddingsDone, state.totalChunks)) {
      const pct = Math.round((state.embeddingsDone / state.totalChunks) * 100);
      this.appendLog(
        documentId,
        'info',
        'embedding',
        `Embeddings: ${state.embeddingsDone}/${state.totalChunks} (${pct}%) — faltam ${state.totalChunks - state.embeddingsDone}`,
        state,
      );
    }

    this.commit(documentId, state);
  }

  init(documentId: string): IngestionProgress {
    const now = new Date().toISOString();
    const progress: IngestionProgress = {
      documentId,
      phase: 'queued',
      percent: 0,
      totalChunks: 0,
      chunksCreated: 0,
      embeddingsDone: 0,
      embeddingsQueued: 0,
      startedAt: now,
      updatedAt: now,
      estimatedSecondsRemaining: null,
      ingestionStatus: IngestionStatus.PENDING,
      logs: [],
    };
    this.store.set(documentId, progress);
    this.embeddingLogMilestone.delete(documentId);
    this.notify(documentId, progress);
    return progress;
  }

  async getSnapshot(documentId: string): Promise<IngestionProgress> {
    const cached = this.store.get(documentId);
    if (cached) return { ...cached, logs: [...cached.logs] };

    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const counts = await this.knowledgeRepository.countChunkEmbeddingsByDocument(documentId);
    const phase = this.phaseFromStatus(document.ingestionStatus, counts);
    const now = new Date().toISOString();

    const createdAt = (document as { createdAt?: Date }).createdAt;
    const updatedAt = (document as { updatedAt?: Date }).updatedAt;

    return {
      documentId,
      phase,
      percent: this.computePercent({
        phase,
        totalChunks: counts.total,
        chunksCreated: counts.total,
        embeddingsDone: counts.withEmbedding,
        embeddingsQueued: counts.total,
      } as IngestionProgress),
      totalChunks: counts.total,
      chunksCreated: counts.total,
      embeddingsDone: counts.withEmbedding,
      embeddingsQueued: counts.total,
      startedAt: createdAt?.toISOString?.() ?? now,
      updatedAt: updatedAt?.toISOString?.() ?? now,
      estimatedSecondsRemaining: null,
      ingestionStatus: document.ingestionStatus as IngestionStatus,
      parseQualityWarning: document.parseQualityWarning,
      offerOcrRetry: document.offerOcrRetry === true,
      logs: this.buildHistoricalLogs(document.ingestionStatus, counts, document.ingestionError),
    };
  }

  subscribe(documentId: string, listener: ProgressListener): () => void {
    const set = this.listeners.get(documentId) ?? new Set();
    set.add(listener);
    this.listeners.set(documentId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(documentId);
    };
  }

  setStatus(documentId: string, status: IngestionStatus): void {
    const state = this.ensure(documentId);
    state.ingestionStatus = status;
    if (status === IngestionStatus.PROCESSING && !state.startedAt) {
      state.startedAt = new Date().toISOString();
    }
    this.commit(documentId, state);
  }

  setPhase(documentId: string, phase: IngestionPhase, message: string, level: IngestionLogLevel = 'info'): void {
    const state = this.ensure(documentId);
    state.phase = phase;
    state.percent = this.computePercent(state);
    this.appendLog(documentId, level, phase, message, state);
    this.commit(documentId, state);
  }

  setParserEngine(documentId: string, engine: string): void {
    const state = this.ensure(documentId);
    state.parserEngine = engine;
    this.commit(documentId, state);
  }

  setTotalChunks(documentId: string, total: number): void {
    const state = this.ensure(documentId);
    state.totalChunks = total;
    state.embeddingsQueued = total;
    state.percent = this.computePercent(state);
    this.appendLog(
      documentId,
      'info',
      'chunking',
      total === 0
        ? 'Nenhum segmento identificado para indexação'
        : `${total} segmento(s) identificado(s) — iniciando criação de pílulas`,
    );
    this.commit(documentId, state);
  }

  chunkCreated(documentId: string, index: number, total: number): void {
    const state = this.ensure(documentId);
    state.chunksCreated = index;
    state.totalChunks = total;
    state.embeddingsQueued = total;
    state.phase = 'chunking';
    state.percent = this.computePercent(state);

    if (this.shouldLogChunkProgress(index, total)) {
      const pct = Math.round((index / total) * 100);
      const message =
        index === total
          ? `Pílulas criadas: ${total}/${total} — enfileirando embeddings`
          : `Criando pílulas: ${index}/${total} (${pct}%)`;
      this.appendLog(documentId, 'info', 'chunking', message, state);
    }

    this.commit(documentId, state);
  }

  embeddingStarted(documentId: string, totalHint: number): void {
    const state = this.ensure(documentId);
    state.phase = 'embedding';
    state.totalChunks = Math.max(state.totalChunks, totalHint);
    state.embeddingsQueued = state.totalChunks;
    state.percent = this.computePercent(state);
    this.commit(documentId, state);
  }

  appendEmbeddingWarning(documentId: string, message: string): void {
    const state = this.ensure(documentId);
    state.phase = 'embedding';
    this.appendLog(documentId, 'warn', 'embedding', message, state);
    this.commit(documentId, state);
  }

  setParseQualityWarning(documentId: string, message: string, offerOcrRetry = true): void {
    const state = this.ensure(documentId);
    state.parseQualityWarning = message;
    state.offerOcrRetry = offerOcrRetry;
    this.appendLog(documentId, 'warn', 'parsing', message, state);
    this.commit(documentId, state);
  }

  clearOcrRetryOffer(documentId: string): void {
    const state = this.ensure(documentId);
    state.offerOcrRetry = false;
    this.commit(documentId, state);
  }

  clearParseQualityFlags(documentId: string): void {
    const state = this.ensure(documentId);
    delete state.parseQualityWarning;
    delete state.offerOcrRetry;
    this.commit(documentId, state);
  }

  complete(documentId: string, message: string): void {
    const state = this.ensure(documentId);
    state.phase = 'completed';
    state.percent = 100;
    state.estimatedSecondsRemaining = 0;
    state.ingestionStatus = IngestionStatus.COMPLETED;
    this.appendLog(documentId, 'success', 'completed', message, state);
    this.commit(documentId, state);
  }

  fail(documentId: string, message: string): void {
    this.stopActivityHeartbeat(documentId);
    const state = this.ensure(documentId);
    state.phase = 'failed';
    state.ingestionStatus = IngestionStatus.FAILED;
    state.estimatedSecondsRemaining = null;
    this.appendLog(documentId, 'error', 'failed', message, state);
    this.commit(documentId, state);
  }

  cancel(documentId: string, message: string): void {
    this.stopActivityHeartbeat(documentId);
    const state = this.ensure(documentId);
    state.phase = 'cancelled';
    state.ingestionStatus = IngestionStatus.CANCELLED;
    state.estimatedSecondsRemaining = null;
    this.appendLog(documentId, 'warn', 'cancelled', message, state);
    this.commit(documentId, state);
  }

  startActivityHeartbeat(
    documentId: string,
    phase: IngestionPhase,
    messagePrefix: string,
    intervalMs = PARSER_HEARTBEAT_MS,
  ): () => void {
    this.stopActivityHeartbeat(documentId);
    const startedAt = Date.now();

    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      const state = this.ensure(documentId);
      state.phase = phase;
      state.percent = this.computePercent(state);
      const engine = state.parserEngine ? ` · ${state.parserEngine}` : '';
      this.appendLog(
        documentId,
        'info',
        phase,
        `${messagePrefix}${engine} — ${this.formatDuration(elapsed)} — ainda processando`,
        state,
      );
      state.estimatedSecondsRemaining = this.estimateRemaining(state);
      this.commit(documentId, state);
    }, intervalMs);

    this.activityHeartbeats.set(documentId, timer);
    return () => this.stopActivityHeartbeat(documentId);
  }

  stopActivityHeartbeat(documentId: string): void {
    const timer = this.activityHeartbeats.get(documentId);
    if (timer) clearInterval(timer);
    this.activityHeartbeats.delete(documentId);
  }

  private ensure(documentId: string): IngestionProgress {
    if (!this.store.has(documentId)) {
      this.init(documentId);
    }
    return this.store.get(documentId)!;
  }

  private appendLog(
    documentId: string,
    level: IngestionLogLevel,
    phase: IngestionPhase,
    message: string,
    state?: IngestionProgress,
  ): void {
    const target = state ?? this.ensure(documentId);
    const entry: IngestionLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
    };
    target.logs.push(entry);
    if (target.logs.length > MAX_LOGS) {
      target.logs.splice(0, target.logs.length - MAX_LOGS);
    }
  }

  private commit(documentId: string, state: IngestionProgress): void {
    state.updatedAt = new Date().toISOString();
    state.estimatedSecondsRemaining = this.estimateRemaining(state);
    this.store.set(documentId, state);
    this.notify(documentId, state);
  }

  private notify(documentId: string, progress: IngestionProgress): void {
    const snapshot = { ...progress, logs: [...progress.logs] };
    for (const listener of this.listeners.get(documentId) ?? []) {
      listener(snapshot);
    }
  }

  private computePercent(state: Pick<
    IngestionProgress,
    'phase' | 'totalChunks' | 'chunksCreated' | 'embeddingsDone' | 'embeddingsQueued'
  >): number {
    const base = PHASE_BASE_PERCENT[state.phase] ?? 0;

    if (state.phase === 'chunking' && state.totalChunks > 0) {
      const chunkRatio = state.chunksCreated / state.totalChunks;
      return Math.round(35 + chunkRatio * 20);
    }

    if (state.phase === 'embedding' && state.totalChunks > 0) {
      const embedRatio = state.embeddingsDone / state.totalChunks;
      return Math.round(55 + embedRatio * 45);
    }

    if (state.phase === 'completed') return 100;
    if (state.phase === 'parsing') return 25;
    if (state.phase === 'loading_source') return 8;

    return base;
  }

  private estimateRemaining(state: IngestionProgress): number | null {
    if (!state.startedAt || state.phase === 'completed' || state.phase === 'failed' || state.phase === 'cancelled') {
      return state.phase === 'completed' ? 0 : null;
    }

    const elapsedSec = (Date.now() - new Date(state.startedAt).getTime()) / 1000;
    if (elapsedSec < 1) return null;

    const percent = Math.max(state.percent, 1);
    const totalEstimate = (elapsedSec / percent) * 100;
    return Math.max(0, Math.round(totalEstimate - elapsedSec));
  }

  private phaseFromStatus(
    status: string,
    counts: { total: number; withEmbedding: number },
  ): IngestionPhase {
    if (status === IngestionStatus.FAILED) return 'failed';
    if (status === IngestionStatus.CANCELLED) return 'cancelled';
    if (status === IngestionStatus.PENDING) return 'queued';
    if (status === IngestionStatus.PROCESSING) return 'parsing';
    if (counts.total > 0 && counts.withEmbedding < counts.total) return 'embedding';
    if (status === IngestionStatus.COMPLETED) return 'completed';
    return 'queued';
  }

  private buildHistoricalLogs(
    status: string,
    counts: { total: number; withEmbedding: number },
    error?: string,
  ): IngestionLogEntry[] {
    const now = new Date().toISOString();
    const logs: IngestionLogEntry[] = [
      {
        id: randomUUID(),
        timestamp: now,
        level: 'info',
        phase: 'queued',
        message: 'Resumo reconstruído do banco — o log detalhado não fica salvo após fechar o console',
      },
    ];

    if (counts.total > 0) {
      logs.push({
        id: randomUUID(),
        timestamp: now,
        level: 'info',
        phase: 'chunking',
        message: `${counts.total} pílula(s) indexada(s)`,
      });
    }

    if (counts.total > 0 && counts.withEmbedding < counts.total) {
      const pct = Math.round((counts.withEmbedding / counts.total) * 100);
      logs.push({
        id: randomUUID(),
        timestamp: now,
        level: 'info',
        phase: 'embedding',
        message: `Embeddings: ${counts.withEmbedding}/${counts.total} (${pct}%) — ainda em andamento ou interrompido`,
      });
    } else if (counts.withEmbedding > 0) {
      logs.push({
        id: randomUUID(),
        timestamp: now,
        level: 'success',
        phase: 'embedding',
        message: `Embeddings: ${counts.withEmbedding}/${counts.total} (100%)`,
      });
    }

    if (status === IngestionStatus.FAILED && error) {
      logs.push({
        id: randomUUID(),
        timestamp: now,
        level: 'error',
        phase: 'failed',
        message: error,
      });
    }

    if (status === IngestionStatus.CANCELLED) {
      logs.push({
        id: randomUUID(),
        timestamp: now,
        level: 'warn',
        phase: 'cancelled',
        message: 'Ingestão cancelada',
      });
    }

    if (
      counts.total > 0 &&
      counts.withEmbedding >= counts.total &&
      status === IngestionStatus.COMPLETED
    ) {
      logs.push({
        id: randomUUID(),
        timestamp: now,
        level: 'success',
        phase: 'completed',
        message: `Ingestão finalizada — ${counts.total} pílula(s) com embeddings`,
      });
    } else if (counts.total === 0 && status === IngestionStatus.COMPLETED) {
      logs.push({
        id: randomUUID(),
        timestamp: now,
        level: 'success',
        phase: 'completed',
        message: 'Processamento concluído sem pílulas geradas',
      });
    }

    return logs;
  }

  private shouldLogChunkProgress(index: number, total: number): boolean {
    if (total <= 1) return true;
    if (index === 1 || index === total) return true;
    const step =
      total <= 50 ? CHUNK_LOG_STEP_SMALL : total <= 200 ? CHUNK_LOG_STEP_MEDIUM : CHUNK_LOG_STEP_LARGE;
    return index % step === 0;
  }

  private shouldLogEmbeddingProgress(documentId: string, done: number, total: number): boolean {
    if (total <= 0 || done <= 0) return false;
    if (done === 1 || done === total) return true;

    const step =
      total <= 30
        ? EMBEDDING_LOG_STEP_SMALL
        : total <= 150
          ? EMBEDDING_LOG_STEP_MEDIUM
          : EMBEDDING_LOG_STEP_LARGE;

    if (done % step === 0) return true;

    const pct = Math.floor((done / total) * 100);
    const last = this.embeddingLogMilestone.get(documentId) ?? -1;
    const milestone = Math.floor(pct / 10) * 10;
    if (milestone >= 10 && milestone > last) {
      this.embeddingLogMilestone.set(documentId, milestone);
      return true;
    }

    return false;
  }

  private formatDuration(totalSeconds: number): string {
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${minutes} min ${seconds}s` : `${minutes} min`;
  }
}
