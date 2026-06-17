'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EngineeringSpecialty } from '@qi-conhecimento/shared-types';
import { buildCitationLabel } from '@qi-conhecimento/shared-utils';
import { SPECIALTY_OPTIONS } from '@/lib/constants';
import { useSearchKnowledgeMutation } from '@/store/api';

export function SearchPage() {
  const { t } = useTranslation('common');
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState<EngineeringSpecialty | ''>('');
  const [search, { data, isLoading, isError }] = useSearchKnowledgeMutation();

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;

    await search({
      query: query.trim(),
      specialty: specialty || undefined,
    });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">{t('search.title')}</h1>
        <p className="text-slate-400 text-sm mt-1">{t('search.subtitle')}</p>
      </div>

      <form
        onSubmit={handleSearch}
        className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4"
      >
        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('search.query')}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.queryPlaceholder')}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('search.specialtyFilter')}</span>
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value as EngineeringSpecialty | '')}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
          >
            <option value="">{t('search.allSpecialties')}</option>
            {SPECIALTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={isLoading || query.trim().length < 3}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          {isLoading ? t('search.searching') : t('search.submit')}
        </button>
      </form>

      {isError ? <p className="text-red-400 text-sm">{t('errors.searchFailed')}</p> : null}

      {data ? (
        <section className="space-y-3">
          <p className="text-slate-400 text-sm">
            {t('search.resultsCount', { count: data.results.length, query: data.query })}
          </p>

          {data.results.length === 0 ? (
            <p className="text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-xl p-4">
              {t('search.noResults')}
            </p>
          ) : (
            data.results.map((result) => (
              <article
                key={result.chunkId}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{result.documentTitle}</h2>
                  <span className="bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 text-xs">
                    {buildCitationLabel(result.normReference, result.normItem)}
                  </span>
                  <span className="bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 text-xs">
                    {t(`specialties.${result.specialty}`)}
                  </span>
                </div>
                <p className="text-slate-300 text-sm whitespace-pre-wrap">{result.excerpt}</p>
                {result.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {result.tags.map((tag) => (
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
        </section>
      ) : null}
    </div>
  );
}
