'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeSearchResult } from '@qi-conhecimento/api-client';
import { EngineeringSpecialty, KnowledgeCitation } from '@qi-conhecimento/shared-types';
import { buildCitationLabel } from '@qi-conhecimento/shared-utils';
import { api } from '@/lib/api';
import { SPECIALTY_OPTIONS } from '@/lib/constants';

type SearchMode = 'chunks' | 'assistant';

export function KnowledgeSearch() {
  const { t } = useTranslation('common');
  const [mode, setMode] = useState<SearchMode>('assistant');
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState<EngineeringSpecialty | ''>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [askResult, setAskResult] = useState<{
    answer?: string;
    citations: KnowledgeCitation[];
  } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 3) return;

    setIsLoading(true);
    setError(null);
    setSearchResults(null);
    setAskResult(null);

    const specialtyFilter = specialty || undefined;

    try {
      if (mode === 'chunks') {
        const data = await api.publicSearchKnowledge({ query: trimmed, specialty: specialtyFilter });
        setSearchQuery(data.query);
        setSearchResults(data.results);
        return;
      }

      const data = await api.publicAskKnowledge({ query: trimmed, specialty: specialtyFilter });
      setAskResult({ answer: data.answer, citations: data.citations });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.searchFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section id="busca" className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('search.title')}</h2>
        <p className="text-slate-400 text-sm mt-1">
          {mode === 'chunks' ? t('search.subtitleChunks') : t('search.subtitleAssistant')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['assistant', 'chunks'] as SearchMode[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              mode === key
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(`search.modes.${key}`)}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4"
      >
        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('search.query')}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === 'chunks'
                ? t('search.queryPlaceholder')
                : t('search.assistantPlaceholder')
            }
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('search.specialtyFilter')}</span>
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value as EngineeringSpecialty | '')}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-emerald-500 outline-none"
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
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          {isLoading
            ? mode === 'chunks'
              ? t('search.searching')
              : t('search.asking')
            : mode === 'chunks'
              ? t('search.submit')
              : t('search.askAssistant')}
        </button>
      </form>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}

      {mode === 'chunks' && searchResults ? (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">
            {t('search.resultsCount', { count: searchResults.length, query: searchQuery })}
          </p>

          {searchResults.length === 0 ? (
            <p className="text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-xl p-4">
              {t('search.noResults')}
            </p>
          ) : (
            searchResults.map((result) => (
              <article
                key={result.chunkId}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{result.documentTitle}</h3>
                  <span className="bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 text-xs">
                    {buildCitationLabel(
                      result.normReference,
                      result.normItem,
                      result.pageStart,
                      result.tableCaption,
                    )}
                  </span>
                  <span className="bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 text-xs">
                    {t(`specialties.${result.specialty}`)}
                  </span>
                </div>
                <p className="text-slate-300 text-sm whitespace-pre-wrap">{result.excerpt}</p>
                {result.sourceUrl ? (
                  <a
                    href={result.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 text-xs underline"
                  >
                    {t('search.viewSource')}
                  </a>
                ) : null}
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
        </div>
      ) : null}

      {mode === 'assistant' && askResult ? (
        <div className="space-y-4">
          <article className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-medium text-emerald-400">{t('search.assistantAnswer')}</h3>
            <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
              {askResult.answer ?? t('search.noAnswer')}
            </p>
          </article>

          <div className="space-y-3">
            <p className="text-slate-400 text-sm">
              {t('search.citationsCount', { count: askResult.citations.length })}
            </p>

            {askResult.citations.length === 0 ? (
              <p className="text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-xl p-4">
                {t('search.noCitations')}
              </p>
            ) : (
              askResult.citations.map((citation) => (
                <article
                  key={citation.chunkId}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{citation.documentTitle}</h3>
                  <span className="bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 text-xs">
                    {buildCitationLabel(
                      citation.normReference,
                      citation.normItem,
                      citation.pageStart,
                      citation.tableCaption,
                    )}
                  </span>
                  </div>
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">{citation.excerpt}</p>
                  {citation.sourceUrl ? (
                    <a
                      href={citation.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 text-xs underline"
                    >
                      {t('search.viewSource')}
                    </a>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
