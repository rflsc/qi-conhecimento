'use client';

import { useTranslation } from 'react-i18next';
import { useGetStatsQuery } from '@/store/api';

export function DashboardPage() {
  const { t } = useTranslation('common');
  const { data: stats, isLoading } = useGetStatsQuery();

  const modules = [
    { key: 'importPdf', icon: '📄', href: '/import?type=pdf' },
    { key: 'importImage', icon: '📷', href: '/import?type=image' },
    { key: 'importLink', icon: '🔗', href: '/import?type=link' },
    { key: 'manualEditor', icon: '✍️', href: '/manual-content' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('hub.title')}</h1>
        {!isLoading && stats ? (
          <div className="flex gap-3 text-sm">
            <span className="bg-emerald-500/10 text-emerald-400 rounded-full px-3 py-1">
              {stats.documents} {t('dashboard.documents')}
            </span>
            <span className="bg-slate-800 text-slate-400 rounded-full px-3 py-1">
              {stats.chunks} {t('dashboard.chunks')}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <a
            key={mod.key}
            href={mod.href}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 hover:border-emerald-500/40 transition-colors"
          >
            <span className="text-2xl">{mod.icon}</span>
            <h2 className="font-medium">{t(`hub.${mod.key}`)}</h2>
            <span className="inline-flex bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 text-xs">
              {t('dashboard.pillar1')}
            </span>
          </a>
        ))}
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="font-medium mb-2">{t('dashboard.quickSearch')}</h2>
        <p className="text-slate-400 text-sm mb-3">{t('dashboard.quickSearchHint')}</p>
        <a
          href="/search"
          className="inline-flex bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          {t('nav.search')}
        </a>
      </section>
    </div>
  );
}
