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
import { ParseProgressUpdate } from '../parsers/parser.interface';

const MAX_LOGS = 300;
const CHUNK_LOG_STEP_SMALL = 5;
const CHUNK_LOG_STEP_MEDIUM = 10;
const CHUNK_LOG_STEP_LARGE = 15;
const EMBEDDING_LOG_STEP_SMALL = 3;
const EMBEDDING_LOG_STEP_MEDIUM = 5;
const EMBEDDING_LOG_STEP_LARGE = 10;
const PARSER_HEARTBEAT_MS = 10_000;
const EMBEDDING_SYNC_MS = 3_000;
const EMBEDDING_HEARTBEAT_MS = 10_000;
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
  private readonly embeddingSyncTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly embeddingLogMilestone = new Map<string, number>();
  private readonly lastEmbeddingHeartbeatAt = new Map<string, number>();

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
    await this.syncEmbeddingProgress(documentId);
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
    if (cached) {
      if (this.isEmbeddingInProgress(cached)) {
        if (!this.embeddingSyncTimers.has(documentId)) {
          this.startEmbeddingSync(documentId);
        } else {
          await this.syncEmbeddingProgress(documentId, { silent: true });
        }
      }
      const state = this.store.get(documentId) ?? cached;
      return { ...state, logs: [...state.logs] };
    }

    const document = await this.knowledgeRepository.findDocumentById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const counts = await this.knowledgeRepository.countChunkEmbeddingsByDocument(documentId);
    const phase = this.phaseFromStatus(document.ingestionStatus, counts);
    const now = new Date().toISOString();

    const createdAt = (document as { createdAt?: Date }).createdAt;
    const updatedAt = (document as { updatedAt?: Date }).updatedAt;

    const snapshot: IngestionProgress = {
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

    this.store.set(documentId, snapshot);
    if (this.isEmbeddingInProgress(snapshot)) {
      this.startEmbeddingSync(documentId);
    }

    return { ...snapshot, logs: [...snapshot.logs] };
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

  chunkCreated(
    documentId: string,
    index: number,
    total: number,
    context?: { chapter?: string; section?: string; normItem?: string },
  ): void {
    const state = this.ensure(documentId);
    state.chunksCreated = index;
    state.totalChunks = total;
    state.embeddingsQueued = total;
    state.phase = 'chunking';
    state.percent = this.computePercent(state);

    if (this.shouldLogChunkProgress(index, total)) {
      const pct = Math.round((index / total) * 100);
      const label = this.formatChunkContext(context);
      const message =
        index === total
          ? `Pílulas criadas: ${total}/${total}${label ? ` — última: ${label}` : ''} — enfileirando embeddings`
          : `Criando pílulas: ${index}/${total} (${pct}%)${label ? ` — ${label}` : ''}`;
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

  /** Sincroniza contadores de embedding com o banco e mantém heartbeat até concluir. */
  startEmbeddingSync(documentId: string): void {
    this.stopEmbeddingSync(documentId);
    void this.syncEmbeddingProgress(documentId);

    const timer = setInterval(() => {
      void this.syncEmbeddingProgress(documentId, { heartbeat: true });
    }, EMBEDDING_SYNC_MS);

    this.embeddingSyncTimers.set(documentId, timer);
  }

  stopEmbeddingSync(documentId: string): void {
    const timer = this.embeddingSyncTimers.get(documentId);
    if (timer) clearInterval(timer);
    this.embeddingSyncTimers.delete(documentId);
  }

  purgeDocument(documentId: string): void {
    this.stopActivityHeartbeat(documentId);
    this.stopEmbeddingSync(documentId);
    this.store.delete(documentId);
    this.listeners.delete(documentId);
    this.embeddingLogMilestone.delete(documentId);
    this.lastEmbeddingHeartbeatAt.delete(documentId);
  }

  async recordEmbeddingDone(documentId: string): Promise<void> {
    await this.syncEmbeddingProgress(documentId);
  }

  private async syncEmbeddingProgress(
    documentId: string,
    options?: { silent?: boolean; heartbeat?: boolean },
  ): Promise<void> {
    const counts = await this.knowledgeRepository.countChunkEmbeddingsByDocument(documentId);
    const state = this.ensure(documentId);
    const prevDone = state.embeddingsDone;
    const prevPhase = state.phase;

    state.embeddingsDone = counts.withEmbedding;
    state.totalChunks = Math.max(state.totalChunks, counts.total);
    state.embeddingsQueued = state.totalChunks;
    const allDone = state.totalChunks > 0 && state.embeddingsDone >= state.totalChunks;
    state.phase = allDone ? 'completed' : 'embedding';
    state.percent = this.computePercent(state);
    state.estimatedSecondsRemaining = allDone ? 0 : this.estimateRemaining(state);

    if (allDone) {
      this.stopEmbeddingSync(documentId);
      this.embeddingLogMilestone.delete(documentId);
      this.lastEmbeddingHeartbeatAt.delete(documentId);
      if (prevPhase !== 'completed' || prevDone < state.embeddingsDone) {
        this.complete(
          documentId,
          `Ingestão finalizada — ${state.embeddingsDone} embedding(s) em ${state.totalChunks} pílula(s)`,
        );
      }
      return;
    }

    const advanced = state.embeddingsDone > prevDone;
    if (
      advanced &&
      !options?.silent &&
      this.shouldLogEmbeddingProgress(documentId, state.embeddingsDone, state.totalChunks)
    ) {
      this.appendEmbeddingProgressLog(documentId, state);
    } else if (options?.heartbeat && !options.silent) {
      const now = Date.now();
      const lastHeartbeat = this.lastEmbeddingHeartbeatAt.get(documentId) ?? 0;
      if (now - lastHeartbeat >= EMBEDDING_HEARTBEAT_MS) {
        this.lastEmbeddingHeartbeatAt.set(documentId, now);
        const elapsed = state.startedAt
          ? Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000)
          : 0;
        const pct = Math.round((state.embeddingsDone / state.totalChunks) * 100);
        this.appendLog(
          documentId,
          'info',
          'embedding',
          `Embeddings em fila — ${state.embeddingsDone}/${state.totalChunks} (${pct}%) · ${this.formatDuration(elapsed)} · processando…`,
          state,
        );
        this.commit(documentId, state);
        return;
      }
    }

    if (advanced || prevDone !== state.embeddingsDone) {
      this.commit(documentId, state);
    }
  }

  private appendEmbeddingProgressLog(documentId: string, state: IngestionProgress): void {
    const pct = Math.round((state.embeddingsDone / state.totalChunks) * 100);
    const remaining = state.totalChunks - state.embeddingsDone;
    this.appendLog(
      documentId,
      'info',
      'embedding',
      `Embeddings: ${state.embeddingsDone}/${state.totalChunks} (${pct}%) — faltam ${remaining}`,
      state,
    );
  }

  private isEmbeddingInProgress(state: IngestionProgress): boolean {
    return (
      state.phase === 'embedding' ||
      (state.ingestionStatus === IngestionStatus.COMPLETED &&
        state.totalChunks > 0 &&
        state.embeddingsDone < state.totalChunks)
    );
  }

  private formatChunkContext(context?: {
    chapter?: string;
    section?: string;
    normItem?: string;
  }): string {
    if (!context) return '';
    const parts = [context.normItem ? `item ${context.normItem}` : null, context.section, context.chapter]
      .filter(Boolean)
      .map((part) => part!.trim())
      .filter(Boolean);
    if (parts.length === 0) return '';
    const label = parts[0];
    return label.length > 80 ? `${label.slice(0, 77)}…` : label;
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

  updateParsePageProgress(documentId: string, update: ParseProgressUpdate): void {
    const state = this.ensure(documentId);
    const prevDone = state.parsePagesDone ?? -1;
    const prevBatch = state.parseBatchIndex ?? 0;

    state.phase = 'parsing';
    state.parsePagesTotal = update.pagesTotal;
    state.parsePagesDone = update.pagesDone;
    state.parseBatchIndex = update.batchIndex;
    state.parseBatchCount = update.batchCount;
    state.percent = this.computePercent(state);

    const batchChanged =
      update.batchIndex != null && update.batchIndex > 0 && update.batchIndex !== prevBatch;
    const pagesAdvanced = update.pagesDone > prevDone;
    const hasTotals = update.pagesTotal > 0;

    if (pagesAdvanced || batchChanged || (hasTotals && prevDone < 0)) {
      const message =
        update.message ??
        (hasTotals
          ? `Docling — ${update.pagesDone}/${update.pagesTotal} página(s)${
              update.batchIndex && update.batchCount
                ? ` · lote ${update.batchIndex}/${update.batchCount}`
                : ''
            }`
          : 'Docling — preparando parse…');
      this.appendLog(documentId, 'info', 'parsing', message, state);
    }

    this.commit(documentId, state);
  }

  clearParsePageProgress(documentId: string): void {
    const state = this.ensure(documentId);
    delete state.parsePagesDone;
    delete state.parsePagesTotal;
    delete state.parseBatchIndex;
    delete state.parseBatchCount;
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
    this.stopEmbeddingSync(documentId);
    const state = this.ensure(documentId);
    state.phase = 'failed';
    state.ingestionStatus = IngestionStatus.FAILED;
    state.estimatedSecondsRemaining = null;
    this.appendLog(documentId, 'error', 'failed', message, state);
    this.commit(documentId, state);
  }

  cancel(documentId: string, message: string): void {
    this.stopActivityHeartbeat(documentId);
    this.stopEmbeddingSync(documentId);
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
      const pageInfo =
        state.parsePagesTotal && state.parsePagesTotal > 0
          ? ` · págs. ${state.parsePagesDone ?? 0}/${state.parsePagesTotal}${
              state.parseBatchIndex && state.parseBatchCount
                ? ` (lote ${state.parseBatchIndex}/${state.parseBatchCount})`
                : ''
            }`
          : '';
      this.appendLog(
        documentId,
        'info',
        phase,
        `${messagePrefix}${engine}${pageInfo} — ${this.formatDuration(elapsed)} — ainda processando`,
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
    | 'phase'
    | 'totalChunks'
    | 'chunksCreated'
    | 'embeddingsDone'
    | 'embeddingsQueued'
    | 'parsePagesDone'
    | 'parsePagesTotal'
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

    if (state.phase === 'parsing' && state.parsePagesTotal && state.parsePagesTotal > 0) {
      const pageRatio = Math.min(1, (state.parsePagesDone ?? 0) / state.parsePagesTotal);
      return Math.round(15 + pageRatio * 10);
    }

    if (state.phase === 'parsing') return 15;
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
