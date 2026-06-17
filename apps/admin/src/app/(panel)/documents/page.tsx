import { AdminShell } from '@/components/AdminShell';

export default function Page() {
  return (
    <AdminShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Documentos técnicos</h1>
        <p className="text-slate-400 text-sm">
          Importação de PDFs (NBRs), manuais e cadernos de encargos — integração com fila de ingestão.
        </p>
        <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left p-3">Título</th>
                <th className="text-left p-3">Especialidade</th>
                <th className="text-left p-3">Fonte</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800 text-slate-500">
                <td className="p-3" colSpan={4}>
                  Nenhum documento ingerido ainda
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
