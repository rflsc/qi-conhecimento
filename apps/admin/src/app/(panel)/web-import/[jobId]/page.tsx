import { WebImportJobDetailPage } from '@/containers/WebImportJobDetailPage';

export default async function Page({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <WebImportJobDetailPage jobId={jobId} />;
}
