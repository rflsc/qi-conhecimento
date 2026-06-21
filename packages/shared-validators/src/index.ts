import { z } from 'zod';
import { EngineeringSpecialty, DocumentSourceType, UserRole } from '@qi-conhecimento/shared-types';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export const createKnowledgeDocumentSchema = z.object({
  title: z.string().min(3).max(300),
  specialty: z.nativeEnum(EngineeringSpecialty),
  sourceType: z.nativeEnum(DocumentSourceType),
  sourceReference: z.string().max(500).optional(),
  normReference: z.string().max(200).optional(),
  author: z.string().max(200).optional(),
});

export const importLinkDocumentSchema = z.object({
  title: z.string().min(3).max(300),
  specialty: z.nativeEnum(EngineeringSpecialty),
  sourceReference: z.string().url().max(500),
  normReference: z.string().max(200).optional(),
  author: z.string().max(200).optional(),
});

export const uploadDocumentSchema = z.object({
  title: z.string().min(3).max(300),
  specialty: z.nativeEnum(EngineeringSpecialty),
  sourceType: z.enum([DocumentSourceType.PDF, DocumentSourceType.IMAGE]),
  normReference: z.string().max(200).optional(),
  author: z.string().max(200).optional(),
  allowWeakParserFallback: z.boolean(),
});

export const uploadMarkdownSchema = z.object({
  title: z.string().min(3).max(300),
  specialty: z.nativeEnum(EngineeringSpecialty),
  normReference: z.string().max(200).optional(),
  author: z.string().max(200).optional(),
  tags: z.array(z.string()).optional(),
});

export const createManualContentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(3).max(300),
  markdownContent: z.string().min(10),
  specialty: z.nativeEnum(EngineeringSpecialty),
  tags: z.array(z.string()).default([]),
});

export const createCmsEntrySchema = z.object({
  title: z.string().min(3).max(300),
  markdownContent: z.string().min(10),
  specialty: z.nativeEnum(EngineeringSpecialty),
  normReference: z.string().max(200).optional(),
  tags: z.array(z.string()),
});

export const searchKnowledgeSchema = z.object({
  query: z.string().min(3).max(500),
  specialty: z.nativeEnum(EngineeringSpecialty).optional(),
});

export const fieldQuerySchema = z.object({
  queryText: z.string().min(3).max(2000),
  specialtyFilter: z.nativeEnum(EngineeringSpecialty).optional(),
  channel: z.enum(['whatsapp', 'telegram']),
  externalUserId: z.string().min(1),
});

export const webImportJobConfigSchema = z.object({
  seedUrl: z.string().url().max(500),
  discovery: z.enum([
    'single_url',
    'sitemap',
    'listing_crawl',
    'filesystem',
  ] as const),
  profileId: z.string().max(100).optional(),
  maxPages: z.number().int().min(1).max(2000).optional(),
  maxDepth: z.number().int().min(1).max(10).optional(),
  sameOriginOnly: z.boolean().optional(),
  pathPrefix: z.string().max(300).optional(),
  tags: z.array(z.string().max(80)).max(20).optional(),
});

export const createWebImportJobSchema = z.object({
  title: z.string().min(3).max(300),
  specialty: z.nativeEnum(EngineeringSpecialty),
  normReference: z.string().max(200).optional(),
  author: z.string().max(200).optional(),
  config: webImportJobConfigSchema,
});

export const updateWebImportSettingsSchema = z.object({
  maxPages: z.number().int().min(1).max(2000),
  maxDepth: z.number().int().min(1).max(10),
  rateLimitMs: z.number().int().min(0).max(60_000),
  fetchTimeoutMs: z.number().int().min(1000).max(120_000),
  userAgent: z.string().min(3).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentSchema>;
export type ImportLinkDocumentInput = z.infer<typeof importLinkDocumentSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type UploadMarkdownInput = z.infer<typeof uploadMarkdownSchema>;
export type CreateManualContentInput = z.infer<typeof createManualContentSchema>;
export type CreateCmsEntryInput = z.infer<typeof createCmsEntrySchema>;
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;
export type FieldQueryInput = z.infer<typeof fieldQuerySchema>;
export type CreateWebImportJobInput = z.infer<typeof createWebImportJobSchema>;
export type UpdateWebImportSettingsInput = z.infer<typeof updateWebImportSettingsSchema>;
export type WebImportJobConfigInput = z.infer<typeof webImportJobConfigSchema>;
