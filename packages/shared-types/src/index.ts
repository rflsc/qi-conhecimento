export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  USER = 'user',
}

export enum EngineeringSpecialty {
  CIVIL = 'civil',
  HYDRAULIC = 'hidraulica',
  ELECTRICAL = 'eletrica',
  WORK_SAFETY = 'seguranca_trabalho',
}

export enum DocumentSourceType {
  PDF = 'pdf',
  IMAGE = 'image',
  HTML = 'html',
  MANUAL_TEXT = 'manual_text',
  LINK = 'link',
}

export enum IngestionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export type IngestionPhase =
  | 'queued'
  | 'loading_source'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type IngestionLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface IngestionLogEntry {
  id: string;
  timestamp: string;
  level: IngestionLogLevel;
  phase: IngestionPhase;
  message: string;
}

export interface IngestionProgress {
  documentId: string;
  phase: IngestionPhase;
  percent: number;
  totalChunks: number;
  chunksCreated: number;
  embeddingsDone: number;
  embeddingsQueued: number;
  startedAt: string | null;
  updatedAt: string;
  estimatedSecondsRemaining: number | null;
  ingestionStatus: IngestionStatus;
  parserEngine?: string;
  /** Aviso quando o parser extraiu pouco texto para o tamanho/páginas do PDF. */
  parseQualityWarning?: string;
  /** Exibe opção de reprocessar o PDF com OCR no console de ingestão. */
  offerOcrRetry?: boolean;
  logs: IngestionLogEntry[];
}

export enum MessagingChannel {
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  specialty: EngineeringSpecialty;
  sourceType: DocumentSourceType;
  sourceReference?: string;
  normReference?: string;
  author?: string;
  ingestionStatus: IngestionStatus;
  ingestionError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  markdownContent: string;
  specialty: EngineeringSpecialty;
  chapter?: string;
  section?: string;
  normItem?: string;
  tags: string[];
  embeddingId?: string;
  createdAt: string;
}

export interface FieldQuery {
  id: string;
  channel: MessagingChannel;
  externalUserId: string;
  queryText: string;
  transcribedFromAudio: boolean;
  specialtyFilter?: EngineeringSpecialty;
  answer?: string;
  citations: KnowledgeCitation[];
  createdAt: string;
}

export interface KnowledgeCitation {
  documentId: string;
  documentTitle: string;
  normReference?: string;
  normItem?: string;
  chunkId: string;
  excerpt: string;
  sourceUrl?: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
}
