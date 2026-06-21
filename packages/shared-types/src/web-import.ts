import { EngineeringSpecialty } from './index';

export enum WebDiscoveryStrategy {
  SINGLE_URL = 'single_url',
  SITEMAP = 'sitemap',
  LISTING_CRAWL = 'listing_crawl',
  FILESYSTEM = 'filesystem',
}

export enum WebImportJobStatus {
  PENDING = 'pending',
  DISCOVERING = 'discovering',
  IMPORTING = 'importing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum WebImportPageStatus {
  PENDING = 'pending',
  FETCHING = 'fetching',
  INGESTING = 'ingesting',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

export type WebImportPhase =
  | 'queued'
  | 'discovering'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WebImportJobConfig {
  seedUrl: string;
  discovery: WebDiscoveryStrategy;
  profileId?: string;
  maxPages?: number;
  maxDepth?: number;
  sameOriginOnly?: boolean;
  pathPrefix?: string;
  tags?: string[];
  rateLimitMs?: number;
}

export interface WebImportJob {
  id: string;
  title: string;
  specialty: EngineeringSpecialty;
  normReference?: string;
  author?: string;
  config: WebImportJobConfig;
  status: WebImportJobStatus;
  pagesDiscovered: number;
  pagesCompleted: number;
  pagesFailed: number;
  pagesSkipped: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebImportPage {
  id: string;
  jobId: string;
  url: string;
  title?: string;
  status: WebImportPageStatus;
  documentId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebImportProgress {
  jobId: string;
  phase: WebImportPhase;
  percent: number;
  pagesDiscovered: number;
  pagesCompleted: number;
  pagesFailed: number;
  pagesSkipped: number;
  pagesPending: number;
  currentUrl?: string;
  message?: string;
  status: WebImportJobStatus;
  updatedAt: string;
}

/** Defaults globais da importação web — editáveis no admin. */
export interface WebImportSettings {
  maxPages: number;
  maxDepth: number;
  rateLimitMs: number;
  fetchTimeoutMs: number;
  userAgent: string;
  updatedAt: string;
}
