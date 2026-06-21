'use client';

import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EngineeringSpecialty } from '@qi-conhecimento/shared-types';
import { createCmsEntrySchema, type CreateCmsEntryInput } from '@qi-conhecimento/shared-validators';
import { SpecialtySelect } from '@/components/SpecialtySelect';
import { useCreateCmsEntryMutation } from '@/store/api';

export function ManualContentPage() {
  const { t } = useTranslation('common');
  const [createCmsEntry, { isLoading }] = useCreateCmsEntryMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateCmsEntryInput>({
    resolver: zodResolver(createCmsEntrySchema),
    defaultValues: {
      title: '',
      markdownContent: '',
      specialty: EngineeringSpecialty.HYDRAULIC,
      normReference: '',
      tags: [],
    },
  });

  const specialty = watch('specialty');
  const title = watch('title');
  const markdownContent = watch('markdownContent');

  async function onSubmit(values: CreateCmsEntryInput) {
    try {
      await createCmsEntry({
        ...values,
        normReference: values.normReference || undefined,
        tags: values.tags?.filter(Boolean) ?? [],
      }).unwrap();
      toast.success(t('cms.queued'));
      reset({
        title: '',
        markdownContent: '',
        specialty: values.specialty,
        normReference: '',
        tags: [],
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  async function handleMarkdownFileSelected(file: File | undefined) {
    if (!file) return;

    const name = file.name.replace(/\.(md|markdown)$/i, '');
    if (!title.trim()) setValue('title', name);

    try {
      const text = await file.text();
      setValue('markdownContent', text, { shouldValidate: true });
    } catch {
      toast.error(t('cms.fileReadFailed'));
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">{t('cms.title')}</h1>
        <p className="text-slate-400 text-sm mt-1">{t('cms.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('cms.fields.markdownFile')}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown"
            onChange={(e) => void handleMarkdownFileSelected(e.target.files?.[0])}
            className="w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200"
          />
          <span className="text-xs text-slate-500">{t('cms.fields.markdownFileHint')}</span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('cms.fields.title')}</span>
          <input
            {...register('title')}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
          {errors.title ? <span className="text-red-400 text-xs">{errors.title.message}</span> : null}
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('cms.fields.specialty')}</span>
          <SpecialtySelect
            value={specialty}
            onChange={(value) => setValue('specialty', value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('cms.fields.normReference')}</span>
          <input
            {...register('normReference')}
            placeholder="NBR 8160"
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('cms.fields.tags')}</span>
          <input
            placeholder={t('cms.fields.tagsPlaceholder')}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            onChange={(e) =>
              setValue(
                'tags',
                e.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('cms.fields.content')}</span>
          <textarea
            {...register('markdownContent')}
            rows={14}
            placeholder={t('cms.fields.contentPlaceholder')}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl p-4 font-mono text-sm focus:ring-1 focus:ring-emerald-500 outline-none"
          />
          {markdownContent ? (
            <span className="text-xs text-slate-500">
              {t('cms.charCount', { count: markdownContent.length })}
            </span>
          ) : null}
          {errors.markdownContent ? (
            <span className="text-red-400 text-xs">{errors.markdownContent.message}</span>
          ) : null}
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          {isLoading ? t('cms.saving') : t('cms.submit')}
        </button>
      </form>
    </div>
  );
}
