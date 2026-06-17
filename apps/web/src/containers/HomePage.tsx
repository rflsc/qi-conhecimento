'use client';

import '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { KnowledgeSearch } from '@/containers/KnowledgeSearch';
import { ADMIN_URL } from '@/lib/constants';

export function HomePage() {
  const { t } = useTranslation('common');

  const pillars = [
    { key: 'hub', desc: 'PDFs, NBRs, fotos, links e CMS interno' },
    { key: 'brain', desc: 'Markdown, chunking, metadados e busca híbrida' },
    { key: 'field', desc: 'WhatsApp/Telegram com respostas citadas' },
  ] as const;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <span className="font-semibold text-emerald-400">{t('brand')}</span>
          <a
            href={`${ADMIN_URL}/login`}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            {t('actions.accessAdmin')}
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 space-y-16">
        <header className="space-y-5 text-center sm:text-left">
          <span className="inline-flex bg-emerald-500/10 text-emerald-400 rounded-full px-2.5 py-0.5 text-xs">
            {t('hero.badge')}
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{t('hero.title')}</h1>
          <p className="text-slate-400 text-lg max-w-2xl">{t('hero.subtitle')}</p>
          <a
            href="#busca"
            className="inline-flex bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            {t('hero.cta')}
          </a>
        </header>

        <KnowledgeSearch />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pillars.map((pillar) => (
            <article
              key={pillar.key}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2"
            >
              <h2 className="font-semibold text-emerald-400">{t(`pillars.${pillar.key}`)}</h2>
              <p className="text-sm text-slate-400">{pillar.desc}</p>
            </article>
          ))}
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">{t('specialtiesTitle')}</h2>
          <div className="flex flex-wrap gap-2">
            {(['civil', 'hidraulica', 'eletrica', 'seguranca_trabalho'] as const).map((key) => (
              <span
                key={key}
                className="bg-slate-800 text-slate-400 rounded-full px-2.5 py-0.5 text-xs"
              >
                {t(`specialties.${key}`)}
              </span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
