import { AdminShell } from '@/components/AdminShell';

const SPECIALTIES = [
  { id: 'civil', label: 'Civil' },
  { id: 'hidraulica', label: 'Hidráulica' },
  { id: 'eletrica', label: 'Elétrica' },
  { id: 'seguranca_trabalho', label: 'Segurança do Trabalho' },
];

export default function Page() {
  return (
    <AdminShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Módulos de especialidade</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SPECIALTIES.map((item) => (
            <article
              key={item.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5"
            >
              <h2 className="font-medium">{item.label}</h2>
              <span className="inline-flex mt-2 bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 text-xs">
                Ativo
              </span>
            </article>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
