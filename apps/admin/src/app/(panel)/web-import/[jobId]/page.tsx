import { AdminShell } from '@/components/AdminShell';
import { WebImportJobDetailPage } from '@/containers/WebImportJobDetailPage';

export default async function Page({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return (
    <AdminShell>
      <WebImportJobDetailPage jobId={jobId} />
    </AdminShell>
  );
}
