'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EngineeringSpecialty, WebDiscoveryStrategy } from '@qi-conhecimento/shared-types';
import {
  createWebImportJobSchema,
  updateWebImportSettingsSchema,
  type CreateWebImportJobInput,
  type UpdateWebImportSettingsInput,
} from '@qi-conhecimento/shared-validators';
import { SpecialtySelect } from '@/components/SpecialtySelect';
import {
  useCancelWebImportJobMutation,
  useCreateWebImportJobMutation,
  useGetWebImportSettingsQuery,
  useListWebImportJobsQuery,
  useUpdateWebImportSettingsMutation,
} from '@/store/api';

const DISCOVERY_OPTIONS: Array<{ value: WebDiscoveryStrategy; labelKey: string }> = [
  { value: WebDiscoveryStrategy.SINGLE_URL, labelKey: 'singleUrl' },
  { value: WebDiscoveryStrategy.SITEMAP, labelKey: 'sitemap' },
  { value: WebDiscoveryStrategy.LISTING_CRAWL, labelKey: 'listingCrawl' },
];

export function WebImportPage() {
  const { t } = useTranslation('common');
  const [page] = useState(1);
  const { data: settings, isLoading: loadingSettings } = useGetWebImportSettingsQuery();
  const { data: jobs, isLoading } = useListWebImportJobsQuery({ page, limit: 10 });
  const [createJob, { isLoading: creating }] = useCreateWebImportJobMutation();
  const [updateSettings, { isLoading: savingSettings }] = useUpdateWebImportSettingsMutation();
  const [cancelJob] = useCancelWebImportJobMutation();

  const settingsForm = useForm<UpdateWebImportSettingsInput>({
    resolver: zodResolver(updateWebImportSettingsSchema),
    defaultValues: {
      maxPages: 500,
      maxDepth: 3,
      rateLimitMs: 1000,
      fetchTimeoutMs: 30_000,
      userAgent: 'QiConhecimento/1.0 (+https://altoqi.com)',
    },
  });

  const jobForm = useForm<CreateWebImportJobInput>({
    resolver: zodResolver(createWebImportJobSchema),
    defaultValues: {
      title: '',
      specialty: EngineeringSpecialty.CIVIL,
      normReference: '',
      author: '',
      config: {
        seedUrl: '',
        discovery: WebDiscoveryStrategy.LISTING_CRAWL,
        maxPages: 500,
        maxDepth: 3,
        sameOriginOnly: true,
        pathPrefix: '',
        tags: [],
      },
    },
  });

  useEffect(() => {
    if (!settings) return;
    settingsForm.reset({
      maxPages: settings.maxPages,
      maxDepth: settings.maxDepth,
      rateLimitMs: settings.rateLimitMs,
      fetchTimeoutMs: settings.fetchTimeoutMs,
      userAgent: settings.userAgent,
    });
    jobForm.setValue('config.maxPages', settings.maxPages);
    jobForm.setValue('config.maxDepth', settings.maxDepth);
  }, [settings, settingsForm, jobForm]);

  const specialty = jobForm.watch('specialty');

  async function onSaveSettings(values: UpdateWebImportSettingsInput) {
    try {
      await updateSettings(values).unwrap();
      toast.success(t('webImport.settings.saved'));
    } catch {
      toast.error(t('webImport.settings.saveFailed'));
    }
  }

  async function onSubmitJob(values: CreateWebImportJobInput) {
    try {
      const result = await createJob({
        ...values,
        normReference: values.normReference || undefined,
        author: values.author || undefined,
        config: {
          ...values.config,
          pathPrefix: values.config.pathPrefix || undefined,
          tags: values.config.tags?.filter(Boolean) ?? [],
        },
      }).unwrap();
      toast.success(t('webImport.created'));
      jobForm.reset({
        title: '',
        specialty: values.specialty,
        normReference: '',
        author: '',
        config: {
          seedUrl: '',
          discovery: values.config.discovery,
          maxPages: settings?.maxPages ?? values.config.maxPages,
          maxDepth: settings?.maxDepth ?? values.config.maxDepth,
          sameOriginOnly: values.config.sameOriginOnly,
          pathPrefix: '',
          tags: [],
        },
      });
      window.location.href = `/web-import/${result.id}`;
    } catch {
      toast.error(t('webImport.failed'));
    }
  }

  async function handleCancel(jobId: string) {
    if (!window.confirm(t('webImport.cancelConfirm'))) return;
    try {
      await cancelJob(jobId).unwrap();
      toast.success(t('webImport.cancelled'));
    } catch {
      toast.error(t('webImport.cancelFailed'));
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">{t('webImport.title')}</h1>
        <p className="text-slate-400 text-sm mt-1">{t('webImport.subtitle')}</p>
      </div>

      <form
        onSubmit={settingsForm.handleSubmit(onSaveSettings)}
        className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5"
      >
        <div>
          <h2 className="font-medium">{t('webImport.settings.title')}</h2>
          <p className="text-sm text-slate-400 mt-1">{t('webImport.settings.subtitle')}</p>
        </div>

        {loadingSettings ? (
          <p className="text-sm text-slate-400">{t('webImport.loading')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm text-slate-400">{t('webImport.fields.maxPages')}</span>
              <input
                type="number"
                {...settingsForm.register('maxPages', { valueAsNumber: true })}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-slate-400">{t('webImport.fields.maxDepth')}</span>
              <input
                type="number"
                {...settingsForm.register('maxDepth', { valueAsNumber: true })}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-slate-400">{t('webImport.settings.rateLimitMs')}</span>
              <input
                type="number"
                {...settingsForm.register('rateLimitMs', { valueAsNumber: true })}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-slate-400">{t('webImport.settings.fetchTimeoutMs')}</span>
              <input
                type="number"
                {...settingsForm.register('fetchTimeoutMs', { valueAsNumber: true })}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </label>

            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm text-slate-400">{t('webImport.settings.userAgent')}</span>
              <input
                {...settingsForm.register('userAgent')}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </label>
          </div>
        )}

        <button
          type="submit"
          disabled={savingSettings || loadingSettings}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium"
        >
          {savingSettings ? t('webImport.settings.saving') : t('webImport.settings.save')}
        </button>
      </form>

      <form
        onSubmit={jobForm.handleSubmit(onSubmitJob)}
        className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5"
      >
        <div>
          <h2 className="font-medium">{t('webImport.newJob')}</h2>
          <p className="text-sm text-slate-400 mt-1">{t('webImport.jobDefaultsHint')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm text-slate-400">{t('webImport.fields.title')}</span>
            <input
              {...jobForm.register('title')}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm text-slate-400">{t('webImport.fields.specialty')}</span>
            <SpecialtySelect
              value={specialty}
              onChange={(value) => jobForm.setValue('specialty', value)}
            />
          </label>

          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm text-slate-400">{t('webImport.fields.seedUrl')}</span>
            <input
              {...jobForm.register('config.seedUrl')}
              placeholder="https://suporte.altoqi.com.br/hc/pt-br/altoqi-eberick"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm text-slate-400">{t('webImport.fields.discovery')}</span>
            <select
              {...jobForm.register('config.discovery')}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            >
              {DISCOVERY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(`webImport.discovery.${option.labelKey}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm text-slate-400">{t('webImport.fields.maxPages')}</span>
            <input
              type="number"
              {...jobForm.register('config.maxPages', { valueAsNumber: true })}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm text-slate-400">{t('webImport.fields.maxDepth')}</span>
            <input
              type="number"
              {...jobForm.register('config.maxDepth', { valueAsNumber: true })}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </label>

          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm text-slate-400">{t('webImport.fields.pathPrefix')}</span>
            <input
              {...jobForm.register('config.pathPrefix')}
              placeholder="/hc/pt-br/articles/"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </label>

          <label className="flex items-center gap-2 sm:col-span-2 pt-1">
            <input type="checkbox" {...jobForm.register('config.sameOriginOnly')} />
            <span className="text-sm text-slate-300">{t('webImport.fields.sameOriginOnly')}</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={creating}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium"
        >
          {creating ? t('webImport.submitting') : t('webImport.submit')}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="font-medium">{t('webImport.recentJobs')}</h2>
        {isLoading ? (
          <p className="text-slate-400 text-sm">{t('webImport.loading')}</p>
        ) : !jobs?.data.length ? (
          <p className="text-slate-400 text-sm">{t('webImport.empty')}</p>
        ) : (
          <div className="space-y-2">
            {jobs.data.map((job) => (
              <div
                key={job.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <Link href={`/web-import/${job.id}`} className="font-medium hover:text-emerald-400">
                    {job.title}
                  </Link>
                  <p className="text-xs text-slate-500 mt-1">
                    {job.status} · {job.pagesCompleted}/{job.pagesDiscovered}{' '}
                    {t('webImport.pages')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/web-import/${job.id}`}
                    className="text-sm px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700"
                  >
                    {t('webImport.view')}
                  </Link>
                  {job.status !== 'cancelled' && job.status !== 'completed' ? (
                    <button
                      type="button"
                      onClick={() => handleCancel(job.id)}
                      className="text-sm px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    >
                      {t('webImport.cancel')}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
