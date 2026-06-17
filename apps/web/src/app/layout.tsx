import type { Metadata } from 'next';
import { HomePage } from '@/containers/HomePage';
import './globals.css';

export const metadata: Metadata = {
  title: 'Qi Conhecimento',
  description: 'Ecossistema de Conhecimento Técnico para Engenharia',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
