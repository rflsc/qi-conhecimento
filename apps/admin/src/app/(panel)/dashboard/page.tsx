import { AdminShell } from '@/components/AdminShell';
import { DashboardPage } from '@/containers/DashboardPage';

export default function Page() {
  return (
    <AdminShell>
      <DashboardPage />
    </AdminShell>
  );
}
