'use client';

import '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

export function LoginPage() {
  const { t } = useTranslation('common');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? t('errors.generic'));
        return;
      }

      const tokens = (await response.json()) as { accessToken: string };
      document.cookie = `access_token=${tokens.accessToken}; path=/; max-age=900; SameSite=Lax`;
      window.location.href = '/dashboard';
    } catch {
      setError(t('errors.apiUnreachable'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4"
      >
        <div>
          <h1 className="text-2xl font-semibold">{t('brand')}</h1>
          <p className="text-slate-400 text-sm">{t('auth.welcome')}</p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('auth.email')}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-slate-400">{t('auth.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white rounded-lg py-2 font-medium"
        >
          {loading ? t('auth.loggingIn') : t('auth.login')}
        </button>
      </form>
    </main>
  );
}
