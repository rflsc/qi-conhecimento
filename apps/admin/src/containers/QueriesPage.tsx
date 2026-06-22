'use client';

import { useState } from 'react';
import { useListFieldQueriesQuery } from '@/store/api';

const PAGE_SIZE = 20;

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  web: 'Web (LP)',
  admin: 'Admin',
};

const SPECIALTY_LABELS: Record<string, string> = {
  civil: 'Civil',
  hidraulica: 'Hidráulica',
  eletrica: 'Elétrica',
  seguranca_trabalho: 'Segurança do Trabalho',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function QueriesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useListFieldQueriesQuery(
    { page, limit: PAGE_SIZE },
    { refetchOnMountOrArgChange: true },
  );

  const rows = data?.page === page ? data.data : undefined;
  const showLoading = isLoading || (isFetching && !rows);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Consultas de campo</h1>
        <p className="text-slate-400 text-sm">
          Histórico de perguntas com respostas citadas — WhatsApp/Telegram (Qi Agents), LP web e
          testes no painel admin.
        </p>
      </div>

      {isError ? (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          Não foi possível carregar o histórico de consultas.
        </p>
      ) : null}

      {showLoading ? <p className="text-slate-400 text-sm">Carregando…</p> : null}

      {rows ? (
        <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left p-3">Canal</th>
                <th className="text-left p-3">Pergunta</th>
                <th className="text-left p-3">Resposta</th>
                <th className="text-left p-3">Citação</th>
                <th className="text-left p-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-b border-slate-800 text-slate-500">
                  <td className="p-3" colSpan={5}>
                    Nenhuma consulta registrada ainda
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const citation = row.citations?.[0];
                  return (
                    <tr key={row.id} className="border-b border-slate-800/80 align-top">
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <span className="bg-slate-800 text-slate-300 rounded-full px-2 py-0.5 text-xs w-fit">
                            {CHANNEL_LABELS[row.channel] ?? row.channel}
                          </span>
                          {row.specialtyFilter ? (
                            <span className="text-slate-500 text-xs">
                              {SPECIALTY_LABELS[row.specialtyFilter] ?? row.specialtyFilter}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3 max-w-xs">
                        <p className="text-slate-200 line-clamp-3">{row.queryText}</p>
                        {row.transcribedFromAudio ? (
                          <span className="text-slate-500 text-xs">🎙️ áudio</span>
                        ) : null}
                      </td>
                      <td className="p-3 max-w-sm">
                        <p className="text-slate-400 line-clamp-3 whitespace-pre-wrap">
                          {row.answer ?? '—'}
                        </p>
                      </td>
                      <td className="p-3 max-w-xs text-slate-400">
                        {citation ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-emerald-400 text-xs font-medium">
                              {citation.normReference ?? citation.documentTitle}
                              {citation.normItem ? `, item ${citation.normItem}` : ''}
                              {citation.pageStart ? ` (p. ${citation.pageStart})` : ''}
                            </span>
                            {row.citations.length > 1 ? (
                              <span className="text-slate-500 text-xs">
                                +{row.citations.length - 1} fonte(s)
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.total > data.limit ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => p - 1)}
            className="bg-slate-800 text-slate-300 rounded-lg px-3 py-1 text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-slate-400 text-sm">
            Página {page}
            {isFetching ? ' · carregando…' : ''}
          </span>
          <button
            type="button"
            disabled={isFetching || page * data.limit >= data.total}
            onClick={() => setPage((p) => p + 1)}
            className="bg-slate-800 text-slate-300 rounded-lg px-3 py-1 text-sm disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      ) : null}
    </div>
  );
}
