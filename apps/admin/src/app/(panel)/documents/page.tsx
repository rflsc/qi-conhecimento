import { AdminShell } from '@/components/AdminShell';
import { DocumentsPage } from '@/containers/DocumentsPage';

export default function Page() {
  return (
    <AdminShell>
      <DocumentsPage />
    </AdminShell>
  );
}
