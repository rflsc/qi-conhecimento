import { Injectable } from '@nestjs/common';
import {
  WebImportJobStatus,
  WebImportPageStatus,
  WebImportPhase,
  WebImportProgress,
} from '@qi-conhecimento/shared-types';

type ProgressListener = (progress: WebImportProgress) => void;

@Injectable()
export class WebImportProgressService {
  private readonly store = new Map<string, WebImportProgress>();
  private readonly listeners = new Map<string, Set<ProgressListener>>();

  init(jobId: string): WebImportProgress {
    const now = new Date().toISOString();
    const progress: WebImportProgress = {
      jobId,
      phase: 'queued',
      percent: 0,
      pagesDiscovered: 0,
      pagesCompleted: 0,
      pagesFailed: 0,
      pagesSkipped: 0,
      pagesPending: 0,
      status: WebImportJobStatus.PENDING,
      message: 'Job enfileirado',
      updatedAt: now,
    };
    this.store.set(jobId, progress);
    this.notify(jobId, progress);
    return progress;
  }

  getSnapshot(jobId: string): WebImportProgress {
    const cached = this.store.get(jobId);
    if (cached) return { ...cached };
    return {
      jobId,
      phase: 'queued',
      percent: 0,
      pagesDiscovered: 0,
      pagesCompleted: 0,
      pagesFailed: 0,
      pagesSkipped: 0,
      pagesPending: 0,
      status: WebImportJobStatus.PENDING,
      updatedAt: new Date().toISOString(),
    };
  }

  subscribe(jobId: string, listener: ProgressListener): () => void {
    const set = this.listeners.get(jobId) ?? new Set<ProgressListener>();
    set.add(listener);
    this.listeners.set(jobId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(jobId);
    };
  }

  update(jobId: string, patch: Partial<WebImportProgress>): WebImportProgress {
    const current = this.store.get(jobId) ?? this.init(jobId);
    const next: WebImportProgress = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    if (
      next.pagesDiscovered > 0 &&
      (next.phase === 'importing' || next.phase === 'completed')
    ) {
      const done = next.pagesCompleted + next.pagesFailed + next.pagesSkipped;
      next.percent = Math.min(100, Math.round((done / next.pagesDiscovered) * 100));
      next.pagesPending = Math.max(0, next.pagesDiscovered - done);
    } else if (next.phase === 'discovering') {
      if (patch.percent === undefined) {
        next.percent = 5;
      }
    } else if (next.phase === 'completed') {
      next.percent = 100;
    }

    this.store.set(jobId, next);
    this.notify(jobId, next);
    return next;
  }

  setPhase(jobId: string, phase: WebImportPhase, message: string, status?: WebImportJobStatus): void {
    this.update(jobId, { phase, message, ...(status ? { status } : {}) });
  }

  private notify(jobId: string, progress: WebImportProgress): void {
    const set = this.listeners.get(jobId);
    if (!set) return;
    for (const listener of set) listener({ ...progress });
  }
}
