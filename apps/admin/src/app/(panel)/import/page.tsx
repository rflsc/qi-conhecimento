import { Suspense } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { ImportDocumentPage } from '@/containers/ImportDocumentPage';

export default function Page() {
  return (
    <AdminShell>
      <Suspense fallback={<p className="text-slate-400 text-sm">...</p>}>
        <ImportDocumentPage />
      </Suspense>
    </AdminShell>
  );
}
