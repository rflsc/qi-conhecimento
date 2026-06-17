'use client';

import '@/lib/i18n';
import { useTranslation } from 'react-i18next';

export function DashboardPage() {
  const { t } = useTranslation('common');

  const modules = [
    { key: 'importPdf', icon: '📄' },
    { key: 'importImage', icon: '📷' },
    { key: 'importLink', icon: '🔗' },
    { key: 'manualEditor', icon: '✍️' },
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('hub.title')}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <article
            key={mod.key}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2"
          >
            <span className="text-2xl">{mod.icon}</span>
            <h2 className="font-medium">{t(`hub.${mod.key}`)}</h2>
            <span className="inline-flex bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 text-xs">
              Pilar 1
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}
