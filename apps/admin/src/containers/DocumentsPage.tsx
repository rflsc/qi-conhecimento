'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCancelIngestionMutation,
  useListChunksQuery,
  useListDocumentsQuery,
} from '@/store/api';
import { INGESTION_STATUS_LABELS, SOURCE_TYPE_LABELS } from '@/lib/constants';

type Tab = 'documents' | 'chunks';

function canCancelIngestion(status: string): boolean {
  return status === 'pending' || status === 'processing';
}

export function DocumentsPage() {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<Tab>('documents');
  const [page, setPage] = useState(1);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const documentsQuery = useListDocumentsQuery({ page, limit: 15 });
  const chunksQuery = useListChunksQuery({ page, limit: 15 });
  const [cancelIngestion] = useCancelIngestionMutation();

  const activeQuery = tab === 'documents' ? documentsQuery : chunksQuery;
  const isError = activeQuery.isError;

  async function handleCancel(documentId: string, title: string) {
    if (!window.confirm(t('documents.cancelConfirm', { title }))) return;

    setCancellingId(documentId);
    try {
      await cancelIngestion(documentId).unwrap();
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('documents.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <a
            href="/import"
            className="inline-flex bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg px-4 py-2 text-sm font-medium w-fit"
          >
            {t('documents.import')}
          </a>
        <a
          href="/manual-content"
          className="inline-flex bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg px-4 py-2 text-sm font-medium w-fit"
        >
          {t('documents.newProcedure')}
        </a>
        </div>
      </div>

      <div className="flex gap-2">
        {(['documents', 'chunks'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === key
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(`documents.tabs.${key}`)}
          </button>
        ))}
      </div>

      {isError ? (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {t('errors.loadFailed')}
        </p>
      ) : null}

      {activeQuery.isLoading ? (
        <p className="text-slate-400 text-sm">{t('common.loading')}</p>
      ) : null}

      {tab === 'documents' && documentsQuery.data ? (
        <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left p-3">{t('documents.columns.title')}</th>
                <th className="text-left p-3">{t('documents.columns.specialty')}</th>
                <th className="text-left p-3">{t('documents.columns.source')}</th>
                <th className="text-left p-3">{t('documents.columns.norm')}</th>
                <th className="text-left p-3">{t('documents.columns.status')}</th>
                <th className="text-left p-3">{t('documents.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {documentsQuery.data.data.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={6}>
                    {t('documents.empty')}
                  </td>
                </tr>
              ) : (
                documentsQuery.data.data.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-800/80">
                    <td className="p-3 font-medium">{doc.title}</td>
                    <td className="p-3 text-slate-400">{t(`specialties.${doc.specialty}`)}</td>
                    <td className="p-3 text-slate-400">
                      {SOURCE_TYPE_LABELS[doc.sourceType] ?? doc.sourceType}
                    </td>
                    <td className="p-3 text-slate-400">{doc.normReference ?? '—'}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                          doc.ingestionStatus === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : doc.ingestionStatus === 'failed'
                              ? 'bg-red-500/10 text-red-400'
                              : doc.ingestionStatus === 'cancelled'
                                ? 'bg-slate-700 text-slate-400'
                              : doc.ingestionStatus === 'processing'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-slate-800 text-slate-400'
                        }`}
                        title={doc.ingestionError ?? undefined}
                      >
                        {INGESTION_STATUS_LABELS[doc.ingestionStatus] ?? doc.ingestionStatus}
                      </span>
                    </td>
                    <td className="p-3">
                      {canCancelIngestion(doc.ingestionStatus) ? (
                        <button
                          type="button"
                          disabled={cancellingId === doc.id}
                          onClick={() => handleCancel(doc.id, doc.title)}
                          className="text-red-400 hover:text-red-300 text-xs font-medium disabled:opacity-50"
                        >
                          {cancellingId === doc.id
                            ? t('documents.cancelling')
                            : t('documents.cancel')}
                        </button>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'chunks' && chunksQuery.data ? (
        <div className="space-y-3">
          {chunksQuery.data.data.length === 0 ? (
            <p className="text-slate-500 text-sm">{t('documents.chunksEmpty')}</p>
          ) : (
            chunksQuery.data.data.map((chunk) => (
              <article
                key={chunk.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{chunk.documentTitle ?? chunk.chapter}</h2>
                  {chunk.normReference ? (
                    <span className="bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 text-xs">
                      {chunk.normReference}
                    </span>
                  ) : null}
                  <span className="bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 text-xs">
                    {t(`specialties.${chunk.specialty}`)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      chunk.hasEmbedding
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {chunk.hasEmbedding ? 'embedding ✓' : 'sem embedding'}
                  </span>
                </div>
                <p className="text-slate-400 text-sm line-clamp-3 whitespace-pre-wrap">
                  {chunk.markdownContent}
                </p>
                {chunk.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {chunk.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-slate-800 text-slate-500 rounded-full px-2 py-0.5 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      ) : null}

      {activeQuery.data && activeQuery.data.total > activeQuery.data.limit ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="bg-slate-800 text-slate-300 rounded-lg px-3 py-1 text-sm disabled:opacity-40"
          >
            {t('common.previous')}
          </button>
          <span className="text-slate-400 text-sm">
            {t('common.page')} {page}
          </span>
          <button
            type="button"
            disabled={page * activeQuery.data.limit >= activeQuery.data.total}
            onClick={() => setPage((p) => p + 1)}
            className="bg-slate-800 text-slate-300 rounded-lg px-3 py-1 text-sm disabled:opacity-40"
          >
            {t('common.next')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
