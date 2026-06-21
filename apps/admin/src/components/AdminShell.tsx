'use client';

import '@/lib/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { clearAccessToken } from '@/lib/auth';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'dashboard' },
  { href: '/import', key: 'import' },
  { href: '/web-import', key: 'webImport' },
  { href: '/documents', key: 'documents' },
  { href: '/manual-content', key: 'manualContent' },
  { href: '/search', key: 'search' },
  { href: '/specialties', key: 'specialties' },
  { href: '/queries', key: 'queries' },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common');
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">{t('brand')}</span>
        <button
          type="button"
          onClick={() => {
            clearAccessToken();
            window.location.href = '/login';
          }}
          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg px-3 py-1 text-sm"
        >
          {t('actions.logout')}
        </button>
      </header>
      <div className="flex">
        <aside className="hidden md:block w-56 border-r border-slate-800 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                pathname === item.href
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </aside>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
