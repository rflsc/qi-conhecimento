import { WebImportJobEntity } from '../schemas/web-import-job.schema';
import { WebImportPageEntity } from '../schemas/web-import-page.schema';

type WithTimestamps = { createdAt?: Date; updatedAt?: Date };

export function mapWebImportJob(job: WebImportJobEntity) {
  const timestamps = job as WebImportJobEntity & WithTimestamps;
  return {
    id: job._id.toString(),
    title: job.title,
    specialty: job.specialty,
    normReference: job.normReference,
    author: job.author,
    config: {
      seedUrl: job.config.seedUrl,
      discovery: job.config.discovery,
      profileId: job.config.profileId,
      maxPages: job.config.maxPages,
      maxDepth: job.config.maxDepth,
      sameOriginOnly: job.config.sameOriginOnly,
      pathPrefix: job.config.pathPrefix,
      tags: job.config.tags ?? [],
      rateLimitMs: job.config.rateLimitMs,
    },
    status: job.status,
    pagesDiscovered: job.pagesDiscovered,
    pagesCompleted: job.pagesCompleted,
    pagesFailed: job.pagesFailed,
    pagesSkipped: job.pagesSkipped,
    documentId: job.documentId?.toString(),
    error: job.error,
    createdAt: timestamps.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: timestamps.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapWebImportPage(page: WebImportPageEntity) {
  const timestamps = page as WebImportPageEntity & WithTimestamps;
  return {
    id: page._id.toString(),
    jobId: page.jobId.toString(),
    url: page.url,
    title: page.title,
    status: page.status,
    documentId: page.documentId?.toString(),
    error: page.error,
    createdAt: timestamps.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: timestamps.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
