'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  useGetLlmConfigQuery,
  useUpdateLlmConfigMutation,
  type LlmProviderSetting,
  type EmbeddingProviderSetting,
} from '@/store/api';

interface SettingsForm {
  llmProvider: LlmProviderSetting;
  anthropicApiKey: string;
  openaiApiKey: string;
  llmModel: string;
  embeddingProvider: EmbeddingProviderSetting;
  embeddingModel: string;
}

const LLM_MODELS: Record<LlmProviderSetting, Array<{ value: string; label: string }>> = {
  anthropic: [
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
  ],
};

const EMBEDDING_MODELS: Record<EmbeddingProviderSetting, Array<{ value: string; label: string }>> = {
  ollama: [{ value: 'nomic-embed-text', label: 'nomic-embed-text (local)' }],
  openai: [{ value: 'text-embedding-3-small', label: 'text-embedding-3-small' }],
};

export function SettingsPage() {
  const { t } = useTranslation('common');
  const { data, isLoading } = useGetLlmConfigQuery();
  const [updateConfig, { isLoading: isSaving }] = useUpdateLlmConfigMutation();

  const [form, setForm] = useState<SettingsForm>({
    llmProvider: 'anthropic',
    anthropicApiKey: '',
    openaiApiKey: '',
    llmModel: 'claude-haiku-4-5',
    embeddingProvider: 'ollama',
    embeddingModel: 'nomic-embed-text',
  });

  useEffect(() => {
    if (!data) return;
    setForm((prev) => ({
      ...prev,
      llmProvider: data.llmProvider,
      anthropicApiKey: '',
      openaiApiKey: '',
      llmModel: data.llmModel,
      embeddingProvider: data.embeddingProvider,
      embeddingModel: data.embeddingModel,
    }));
  }, [data]);

  const handleSave = async () => {
    try {
      await updateConfig({
        llmProvider: form.llmProvider,
        llmModel: form.llmModel,
        embeddingProvider: form.embeddingProvider,
        embeddingModel: form.embeddingModel,
        ...(form.anthropicApiKey.trim()
          ? { anthropicApiKey: form.anthropicApiKey.trim() }
          : {}),
        ...(form.openaiApiKey.trim() ? { openaiApiKey: form.openaiApiKey.trim() } : {}),
      }).unwrap();
      setForm((prev) => ({ ...prev, anthropicApiKey: '', openaiApiKey: '' }));
      toast.success(t('settings.saved'));
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  if (isLoading) {
    return <div className="text-sm text-slate-500">{t('actions.loading')}</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('settings.subtitle')}</p>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-200">{t('settings.llm.title')}</h2>
        <p className="text-xs text-slate-500">{t('settings.llm.dualKeyHint')}</p>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">{t('settings.llm.provider')}</label>
          <select
            value={form.llmProvider}
            onChange={(e) => {
              const llmProvider = e.target.value as LlmProviderSetting;
              setForm({
                ...form,
                llmProvider,
                llmModel: LLM_MODELS[llmProvider][0]?.value ?? form.llmModel,
              });
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              {t('settings.llm.anthropicApiKey')}
            </label>
            <input
              type="password"
              value={form.anthropicApiKey}
              onChange={(e) => setForm({ ...form, anthropicApiKey: e.target.value })}
              placeholder={t('settings.llm.apiKeyPlaceholder')}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              autoComplete="off"
            />
            {data?.anthropic.hasApiKey && data.anthropic.apiKeyMasked && (
              <p className="text-xs text-slate-500 mt-1">
                {t('settings.llm.currentKey')}: {data.anthropic.apiKeyMasked}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              {t('settings.llm.openaiApiKey')}
            </label>
            <input
              type="password"
              value={form.openaiApiKey}
              onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })}
              placeholder={t('settings.llm.apiKeyPlaceholder')}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              autoComplete="off"
            />
            {data?.openai.hasApiKey && data.openai.apiKeyMasked && (
              <p className="text-xs text-slate-500 mt-1">
                {t('settings.llm.currentKey')}: {data.openai.apiKeyMasked}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">{t('settings.llm.model')}</label>
          <select
            value={form.llmModel}
            onChange={(e) => setForm({ ...form, llmModel: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            {LLM_MODELS[form.llmProvider].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-slate-200">{t('settings.embedding.title')}</h2>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">
            {t('settings.embedding.provider')}
          </label>
          <select
            value={form.embeddingProvider}
            onChange={(e) => {
              const embeddingProvider = e.target.value as EmbeddingProviderSetting;
              setForm({
                ...form,
                embeddingProvider,
                embeddingModel:
                  EMBEDDING_MODELS[embeddingProvider][0]?.value ?? form.embeddingModel,
              });
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="ollama">Ollama (local / grátis)</option>
            <option value="openai">OpenAI (pago)</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">
            {t('settings.embedding.model')}
          </label>
          <select
            value={form.embeddingModel}
            onChange={(e) => setForm({ ...form, embeddingModel: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            {EMBEDDING_MODELS[form.embeddingProvider].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {form.embeddingProvider === 'openai' && (
            <p className="text-xs text-slate-500 mt-1">{t('settings.embedding.openaiKeyHint')}</p>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
      >
        {isSaving ? t('actions.saving') : t('actions.save')}
      </button>
    </div>
  );
}
