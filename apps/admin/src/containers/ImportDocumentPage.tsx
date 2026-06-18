'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DocumentSourceType, EngineeringSpecialty } from '@qi-conhecimento/shared-types';
import {
  importLinkDocumentSchema,
  uploadDocumentSchema,
  type ImportLinkDocumentInput,
  type UploadDocumentInput,
} from '@qi-conhecimento/shared-validators';
import { SpecialtySelect } from '@/components/SpecialtySelect';
import { useGetParserStatusQuery, useImportLinkMutation, useUploadDocumentMutation } from '@/store/api';

type ImportTab = 'pdf' | 'image' | 'link';

const TAB_SOURCE: Record<ImportTab, DocumentSourceType> = {
  pdf: DocumentSourceType.PDF,
  image: DocumentSourceType.IMAGE,
  link: DocumentSourceType.LINK,
};

export function ImportDocumentPage() {
  const { t } = useTranslation('common');
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('type') as ImportTab) ?? 'pdf';
  const [tab, setTab] = useState<ImportTab>(
    ['pdf', 'image', 'link'].includes(initialTab) ? initialTab : 'pdf',
  );
  const [file, setFile] = useState<File | null>(null);
  const [uploadDocument, { isLoading: uploading }] = useUploadDocumentMutation();
  const [importLink, { isLoading: importingLink }] = useImportLinkMutation();
  const { data: parserStatus } = useGetParserStatusQuery(undefined, {
    skip: tab !== 'pdf',
    pollingInterval: 15_000,
  });

  const fileForm = useForm<UploadDocumentInput>({
    resolver: zodResolver(uploadDocumentSchema),
    defaultValues: {
      title: '',
      specialty: EngineeringSpecialty.HYDRAULIC,
      sourceType: DocumentSourceType.PDF,
      normReference: '',
      author: '',
      allowWeakParserFallback: false,
    },
  });

  const linkForm = useForm<ImportLinkDocumentInput>({
    resolver: zodResolver(importLinkDocumentSchema),
    defaultValues: {
      title: '',
      specialty: EngineeringSpecialty.HYDRAULIC,
      sourceReference: '',
      normReference: '',
      author: '',
    },
  });

  const fileSpecialty = fileForm.watch('specialty');
  const allowWeakParserFallback = fileForm.watch('allowWeakParserFallback');
  const linkSpecialty = linkForm.watch('specialty');
  const isLoading = uploading || importingLink;

  function handleTabChange(next: ImportTab) {
    setTab(next);
    setFile(null);
    if (next === 'pdf') fileForm.setValue('sourceType', DocumentSourceType.PDF);
    if (next === 'image') fileForm.setValue('sourceType', DocumentSourceType.IMAGE);
  }

  async function onSubmitFile(values: UploadDocumentInput) {
    if (!file) {
      toast.error(t('import.fileRequired'));
      return;
    }

    if (
      tab === 'pdf' &&
      !values.allowWeakParserFallback &&
      parserStatus &&
      (!parserStatus.configured || !parserStatus.reachable)
    ) {
      toast.error(t('import.doclingOffline'));
      return;
    }

    try {
      await uploadDocument({
        ...values,
        file,
        sourceType: TAB_SOURCE[tab] as UploadDocumentInput['sourceType'],
      }).unwrap();
      toast.success(t('import.queued'));
      fileForm.reset({
        title: '',
        specialty: values.specialty,
        sourceType: TAB_SOURCE[tab] as UploadDocumentInput['sourceType'],
        normReference: '',
        author: '',
        allowWeakParserFallback: false,
      });
      setFile(null);
    } catch {
      toast.error(t('import.failed'));
    }
  }

  async function onSubmitLink(values: ImportLinkDocumentInput) {
    try {
      await importLink({
        ...values,
        normReference: values.normReference || undefined,
        author: values.author || undefined,
      }).unwrap();
      toast.success(t('import.queued'));
      linkForm.reset({
        title: '',
        specialty: values.specialty,
        sourceReference: '',
        normReference: '',
        author: '',
      });
    } catch {
      toast.error(t('import.failed'));
    }
  }

  const accept = tab === 'pdf' ? '.pdf,application/pdf' : '.jpg,.jpeg,.png,.webp,image/*';

  const parserBanner =
    tab === 'pdf' && parserStatus
      ? !parserStatus.configured
        ? { tone: 'amber' as const, text: t('import.doclingNotConfigured') }
        : parserStatus.reachable
          ? { tone: 'emerald' as const, text: t('import.doclingOnline') }
          : { tone: 'amber' as const, text: t('import.doclingOffline') }
      : null;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">{t('import.title')}</h1>
        <p className="text-slate-400 text-sm mt-1">{t('import.subtitle')}</p>
      </div>

      <div className="flex gap-2">
        {(['pdf', 'image', 'link'] as ImportTab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleTabChange(key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === key
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(`import.tabs.${key}`)}
          </button>
        ))}
      </div>

      {parserBanner ? (
        <p
          className={`text-sm rounded-lg px-3 py-2 border ${
            parserBanner.tone === 'emerald'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
          }`}
        >
          {parserBanner.text}
        </p>
      ) : null}

      {tab === 'link' ? (
        <form onSubmit={linkForm.handleSubmit(onSubmitLink)} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm text-slate-400">{t('import.fields.title')}</span>
            <input
              {...linkForm.register('title')}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            {linkForm.formState.errors.title ? (
              <span className="text-red-400 text-xs">{linkForm.formState.errors.title.message}</span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-slate-400">{t('import.fields.url')}</span>
            <input
              {...linkForm.register('sourceReference')}
              placeholder="https://"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            {linkForm.formState.errors.sourceReference ? (
              <span className="text-red-400 text-xs">
                {linkForm.formState.errors.sourceReference.message}
              </span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-slate-400">{t('import.fields.specialty')}</span>
            <SpecialtySelect
              value={linkSpecialty}
              onChange={(value) => linkForm.setValue('specialty', value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-slate-400">{t('import.fields.normReference')}</span>
            <input
              {...linkForm.register('normReference')}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            {isLoading ? t('import.submitting') : t('import.submitLink')}
          </button>
        </form>
      ) : (
        <form onSubmit={fileForm.handleSubmit(onSubmitFile)} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm text-slate-400">{t('import.fields.file')}</span>
            <input
              type="file"
              accept={accept}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-slate-400">{t('import.fields.title')}</span>
            <input
              {...fileForm.register('title')}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            {fileForm.formState.errors.title ? (
              <span className="text-red-400 text-xs">{fileForm.formState.errors.title.message}</span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-slate-400">{t('import.fields.specialty')}</span>
            <SpecialtySelect
              value={fileSpecialty}
              onChange={(value) => fileForm.setValue('specialty', value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-slate-400">{t('import.fields.normReference')}</span>
            <input
              {...fileForm.register('normReference')}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </label>

          {tab === 'pdf' ? (
            <label className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(allowWeakParserFallback)}
                onChange={(e) => fileForm.setValue('allowWeakParserFallback', e.target.checked)}
                className="mt-1 rounded border-slate-600"
              />
              <span className="space-y-1">
                <span className="block text-sm text-slate-200">{t('import.weakParserFallback')}</span>
                <span className="block text-xs text-slate-500">{t('import.weakParserHint')}</span>
              </span>
            </label>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || !file}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            {isLoading ? t('import.submitting') : t('import.submitFile')}
          </button>
        </form>
      )}
    </div>
  );
}
