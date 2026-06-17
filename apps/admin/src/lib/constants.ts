export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

export const SPECIALTY_OPTIONS = [
  { value: 'civil', labelKey: 'specialties.civil' },
  { value: 'hidraulica', labelKey: 'specialties.hidraulica' },
  { value: 'eletrica', labelKey: 'specialties.eletrica' },
  { value: 'seguranca_trabalho', labelKey: 'specialties.seguranca_trabalho' },
] as const;

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  image: 'Imagem',
  html: 'HTML',
  manual_text: 'CMS',
  link: 'Link',
};

export const INGESTION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  completed: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};
