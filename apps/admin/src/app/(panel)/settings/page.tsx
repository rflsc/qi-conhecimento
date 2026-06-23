import { AdminShell } from '@/components/AdminShell';
import { SettingsPage } from '@/containers/SettingsPage';

export default function Page() {
  return (
    <AdminShell>
      <SettingsPage />
    </AdminShell>
  );
}
