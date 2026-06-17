import { AdminShell } from '@/components/AdminShell';

export default function Page() {
  return (
    <AdminShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">CMS interno</h1>
        <textarea
          placeholder="Procedimento interno, nota de campo ou boa prática (Markdown)..."
          className="w-full min-h-64 bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl p-4 focus:ring-1 focus:ring-emerald-500 outline-none"
        />
        <button
          type="button"
          className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          Salvar procedimento
        </button>
      </div>
    </AdminShell>
  );
}
