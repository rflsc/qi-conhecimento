'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { WebImportProgress } from '@qi-conhecimento/shared-types';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';
import {
  useCancelWebImportJobMutation,
  useGetWebImportJobQuery,
  useListWebImportPagesQuery,
  useRetryWebImportFailedMutation,
} from '@/store/api';

function parseSseChunk(buffer: string): { events: WebImportProgress[]; rest: string } {
  const events: WebImportProgress[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith('data:')) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as WebImportProgress);
    } catch {
      // ignora chunk parcial
    }
  }

  return { events, rest };
}

export function WebImportJobDetailPage({ jobId }: { jobId: string }) {
  const { t } = useTranslation('common');
  const { data: job, refetch: refetchJob } = useGetWebImportJobQuery(jobId);
  const { data: pages, refetch: refetchPages } = useListWebImportPagesQuery({
    jobId,
    page: 1,
    limit: 100,
  });
  const [cancelJob] = useCancelWebImportJobMutation();
  const [retryFailed, { isLoading: retrying }] = useRetryWebImportFailedMutation();
  const [progress, setProgress] = useState<WebImportProgress | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    let closed = false;
    let buffer = '';
    const controller = new AbortController();

    void fetch(`${API_URL}/knowledge/web-imports/${jobId}/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseChunk(buffer);
          buffer = parsed.rest;
          const latest = parsed.events[parsed.events.length - 1];
          if (latest) {
            setProgress(latest);
            if (latest.status === 'completed' || latest.status === 'failed' || latest.status === 'cancelled') {
              void refetchJob();
              void refetchPages();
            }
          }
        }
      })
      .catch(() => undefined);

    return () => {
      closed = true;
      controller.abort();
    };
  }, [jobId, refetchJob, refetchPages]);

  async function handleCancel() {
    if (!window.confirm(t('webImport.cancelConfirm'))) return;
    try {
      await cancelJob(jobId).unwrap();
      toast.success(t('webImport.cancelled'));
      void refetchJob();
    } catch {
      toast.error(t('webImport.cancelFailed'));
    }
  }

  async function handleRetry() {
    try {
      await retryFailed(jobId).unwrap();
      toast.success(t('webImport.retryQueued'));
      void refetchJob();
      void refetchPages();
    } catch {
      toast.error(t('webImport.retryFailedToast'));
    }
  }

  if (!job) {
    return <p className="text-slate-400">{t('webImport.loading')}</p>;
  }

  const percent = progress?.percent ?? 0;
  const stats = {
    discovered: progress?.pagesDiscovered ?? job.pagesDiscovered,
    completed: progress?.pagesCompleted ?? job.pagesCompleted,
    failed: progress?.pagesFailed ?? job.pagesFailed,
    skipped: progress?.pagesSkipped ?? job.pagesSkipped,
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/web-import" className="text-sm text-slate-500 hover:text-slate-300">
            ← {t('webImport.back')}
          </Link>
          <h1 className="text-2xl font-semibold mt-2">{job.title}</h1>
          <p className="text-sm text-slate-400 mt-1">{job.config.seedUrl}</p>
        </div>
        <div className="flex gap-2">
          {job.pagesFailed > 0 ? (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="text-sm px-3 py-1 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            >
              {t('webImport.retryFailed')}
            </button>
          ) : null}
          {job.status !== 'cancelled' && job.status !== 'completed' ? (
            <button
              type="button"
              onClick={handleCancel}
              className="text-sm px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
            >
              {t('webImport.cancel')}
            </button>
          ) : null}
        </div>
      </div>

      {job.documentId ? (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm">
          <span className="text-slate-400">{t('webImport.documentCreated')}: </span>
          <Link href="/documents" className="text-emerald-400 hover:underline font-medium">
            {job.title}
          </Link>
          <span className="text-slate-500 ml-2">({job.documentId.slice(0, 8)}…)</span>
        </div>
      ) : null}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">{progress?.message ?? job.status}</span>
          <span className="text-emerald-400">{percent}%</span>
        </div>
        {progress?.currentUrl ? (
          <p className="text-xs text-slate-500 truncate" title={progress.currentUrl}>
            {progress.currentUrl}
          </p>
        ) : null}
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-slate-500">{t('webImport.stats.discovered')}</p>
            <p>{stats.discovered}</p>
          </div>
          <div>
            <p className="text-slate-500">{t('webImport.stats.completed')}</p>
            <p>{stats.completed}</p>
          </div>
          <div>
            <p className="text-slate-500">{t('webImport.stats.failed')}</p>
            <p>{stats.failed}</p>
          </div>
          <div>
            <p className="text-slate-500">{t('webImport.stats.skipped')}</p>
            <p>{stats.skipped}</p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">{t('webImport.pagesList')}</h2>
        {!pages?.data.length ? (
          <p className="text-slate-400 text-sm">{t('webImport.noPages')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2">{t('webImport.table.url')}</th>
                  <th className="text-left px-4 py-2">{t('webImport.table.status')}</th>
                  <th className="text-left px-4 py-2">{t('webImport.table.document')}</th>
                </tr>
              </thead>
              <tbody>
                {pages.data.map((page) => (
                  <tr key={page.id} className="border-t border-slate-800">
                    <td className="px-4 py-2 max-w-md truncate">{page.url}</td>
                    <td className="px-4 py-2">{page.status}</td>
                    <td className="px-4 py-2">
                      {page.documentId ? (
                        <Link href="/documents" className="text-emerald-400 hover:underline">
                          {page.documentId.slice(0, 8)}…
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
