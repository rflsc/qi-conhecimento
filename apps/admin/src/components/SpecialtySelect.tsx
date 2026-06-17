'use client';

import { useTranslation } from 'react-i18next';
import { EngineeringSpecialty } from '@qi-conhecimento/shared-types';
import { SPECIALTY_OPTIONS } from '@/lib/constants';

interface SpecialtySelectProps {
  value: EngineeringSpecialty;
  onChange: (value: EngineeringSpecialty) => void;
  id?: string;
}

export function SpecialtySelect({ value, onChange, id }: SpecialtySelectProps) {
  const { t } = useTranslation('common');

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as EngineeringSpecialty)}
      className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
    >
      {SPECIALTY_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {t(option.labelKey)}
        </option>
      ))}
    </select>
  );
}
