import { AdminShell } from '@/components/AdminShell';

export default function Page() {
  return (
    <AdminShell>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Consultas de campo</h1>
        <p className="text-slate-400 text-sm">
          Histórico de perguntas via WhatsApp/Telegram com respostas citadas (Pilar 3).
        </p>
        <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left p-3">Canal</th>
                <th className="text-left p-3">Pergunta</th>
                <th className="text-left p-3">Citação</th>
                <th className="text-left p-3">Data</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800 text-slate-500">
                <td className="p-3" colSpan={4}>
                  Nenhuma consulta registrada ainda
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
