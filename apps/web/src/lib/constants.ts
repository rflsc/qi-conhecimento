export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3102';

export const SPECIALTY_OPTIONS = [
  { value: 'civil', labelKey: 'specialties.civil' },
  { value: 'hidraulica', labelKey: 'specialties.hidraulica' },
  { value: 'eletrica', labelKey: 'specialties.eletrica' },
  { value: 'seguranca_trabalho', labelKey: 'specialties.seguranca_trabalho' },
] as const;
