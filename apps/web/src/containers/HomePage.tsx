'use client';

import '@/lib/i18n';
import { useTranslation } from 'react-i18next';

export function HomePage() {
  const { t } = useTranslation('common');

  const pillars = [
    { key: 'hub', desc: 'PDFs, NBRs, fotos, links e CMS interno' },
    { key: 'brain', desc: 'Markdown, chunking, metadados e busca híbrida' },
    { key: 'field', desc: 'WhatsApp/Telegram com respostas citadas' },
  ] as const;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 sm:px-6 py-12">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="space-y-4">
          <span className="inline-flex bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 text-xs">
            AltoQi · Engenharia
          </span>
          <h1 className="text-4xl font-bold tracking-tight">{t('brand')}</h1>
          <p className="text-slate-400 text-lg">{t('tagline')}</p>
          <a
            href="http://localhost:3102/login"
            className="inline-flex bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            {t('actions.accessAdmin')}
          </a>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pillars.map((pillar) => (
            <article
              key={pillar.key}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2"
            >
              <h2 className="font-semibold text-emerald-400">
                {t(`pillars.${pillar.key}`)}
              </h2>
              <p className="text-sm text-slate-400">{pillar.desc}</p>
            </article>
          ))}
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Especialidades</h2>
          <div className="flex flex-wrap gap-2">
            {(['civil', 'hidraulica', 'eletrica', 'seguranca_trabalho'] as const).map((key) => (
              <span
                key={key}
                className="bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 text-xs"
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
