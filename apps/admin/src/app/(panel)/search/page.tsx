import { AdminShell } from '@/components/AdminShell';
import { SearchPage } from '@/containers/SearchPage';

export default function Page() {
  return (
    <AdminShell>
      <SearchPage />
    </AdminShell>
  );
}
