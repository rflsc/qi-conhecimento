import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Qi Conhecimento — Busca técnica com RAG',
  description:
    'Consulte normas, procedimentos e boas práticas de engenharia com busca híbrida e assistente RAG. Acesso público.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
