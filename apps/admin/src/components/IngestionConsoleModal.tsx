'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { IngestionLogEntry, IngestionPhase, IngestionProgress } from '@qi-conhecimento/shared-types';
import { useIngestionProgress } from '@/hooks/useIngestionStream';
import { INGESTION_STATUS_LABELS } from '@/lib/constants';

interface Props {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}

const PHASE_LABEL_KEYS: Record<IngestionPhase, string> = {
  queued: 'ingestionConsole.phases.queued',
  loading_source: 'ingestionConsole.phases.loading_source',
  parsing: 'ingestionConsole.phases.parsing',
  chunking: 'ingestionConsole.phases.chunking',
  embedding: 'ingestionConsole.phases.embedding',
  completed: 'ingestionConsole.phases.completed',
  failed: 'ingestionConsole.phases.failed',
  cancelled: 'ingestionConsole.phases.cancelled',
};

const LOG_COLORS: Record<IngestionLogEntry['level'], string> = {
  info: 'text-slate-300',
  warn: 'text-amber-400',
  error: 'text-red-400',
  success: 'text-emerald-400',
};

function formatEta(
  seconds: number | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (seconds == null) return t('ingestionConsole.etaUnknown');
  if (seconds <= 0) return t('ingestionConsole.etaDone');
  if (seconds < 60) return t('ingestionConsole.etaSeconds', { count: seconds });
  const minutes = Math.ceil(seconds / 60);
  return t('ingestionConsole.etaMinutes', { count: minutes });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ProgressPanel({ progress, t }: { progress: IngestionProgress; t: (key: string, opts?: Record<string, unknown>) => string }) {
  return (
    <div className="space-y-3 border-b border-slate-800 pb-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="bg-slate-800 text-slate-300 rounded-full px-2.5 py-0.5">
          {t(PHASE_LABEL_KEYS[progress.phase])}
        </span>
        <span className="text-slate-500">
          {INGESTION_STATUS_LABELS[progress.ingestionStatus] ?? progress.ingestionStatus}
        </span>
        {progress.parserEngine ? (
          <span className="text-slate-500">· {progress.parserEngine}</span>
        ) : null}
        <span
          className={`ml-auto text-xs ${progress.phase === 'completed' ? 'text-emerald-400' : 'text-slate-400'}`}
        >
          {formatEta(progress.estimatedSecondsRemaining, t)}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{t('ingestionConsole.progress')}</span>
          <span className="font-mono text-emerald-400">{progress.percent}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <p className="text-slate-500">{t('ingestionConsole.stats.chunks')}</p>
          <p className="font-mono text-slate-200">
            {progress.chunksCreated}/{progress.totalChunks || '—'}
          </p>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <p className="text-slate-500">{t('ingestionConsole.stats.embeddings')}</p>
          <p className="font-mono text-slate-200">
            {progress.embeddingsDone}/{progress.totalChunks || progress.embeddingsQueued || '—'}
          </p>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 col-span-2 sm:col-span-2">
          <p className="text-slate-500">{t('ingestionConsole.stats.updated')}</p>
          <p className="font-mono text-slate-200">{formatTime(progress.updatedAt)}</p>
        </div>
      </div>
    </div>
  );
}

export function IngestionConsoleModal({ documentId, documentTitle, onClose }: Props) {
  const { t } = useTranslation('common');
  const { progress, connected } = useIngestionProgress(documentId, true);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress?.logs.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ingestion-console-title"
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div>
            <h2 id="ingestion-console-title" className="font-semibold text-lg">
              {t('ingestionConsole.title')}
            </h2>
            <p className="text-slate-400 text-sm mt-0.5 truncate max-w-md">{documentTitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 ${
                connected
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {connected ? t('ingestionConsole.live') : t('ingestionConsole.connecting')}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1 rounded"
              aria-label={t('ingestionConsole.close')}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="px-5 pt-4 overflow-y-auto flex-1">
          {progress ? <ProgressPanel progress={progress} t={t} /> : (
            <p className="text-slate-400 text-sm pb-4">{t('ingestionConsole.loading')}</p>
          )}

          <div className="mt-2">
            <p className="text-xs text-slate-500 mb-2 font-mono uppercase tracking-wide">
              {t('ingestionConsole.logTitle')}
            </p>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs max-h-72 overflow-y-auto space-y-1">
              {progress?.logs.length ? (
                progress.logs.map((entry) => (
                  <div key={entry.id} className="flex gap-2 leading-relaxed">
                    <span className="text-slate-600 shrink-0">{formatTime(entry.timestamp)}</span>
                    <span className="text-slate-600 shrink-0 w-16">[{entry.phase}]</span>
                    <span className={LOG_COLORS[entry.level]}>{entry.message}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-600">{t('ingestionConsole.noLogs')}</p>
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-slate-800 text-xs text-slate-500">
          {progress?.phase === 'parsing'
            ? t('ingestionConsole.parsingHint')
            : t('ingestionConsole.hint')}
        </footer>
      </div>
    </div>
  );
}
