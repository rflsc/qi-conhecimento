import { AdminShell } from '@/components/AdminShell';
import { QueriesPage } from '@/containers/QueriesPage';

export default function Page() {
  return (
    <AdminShell>
      <QueriesPage />
    </AdminShell>
  );
}
