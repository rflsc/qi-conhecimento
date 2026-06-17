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

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentSchema>;
export type ImportLinkDocumentInput = z.infer<typeof importLinkDocumentSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type CreateManualContentInput = z.infer<typeof createManualContentSchema>;
export type CreateCmsEntryInput = z.infer<typeof createCmsEntrySchema>;
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;
export type FieldQueryInput = z.infer<typeof fieldQuerySchema>;
