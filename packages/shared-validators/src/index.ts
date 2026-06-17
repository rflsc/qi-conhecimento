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

export const createManualContentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(3).max(300),
  markdownContent: z.string().min(10),
  specialty: z.nativeEnum(EngineeringSpecialty),
  tags: z.array(z.string()).default([]),
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
export type CreateManualContentInput = z.infer<typeof createManualContentSchema>;
export type FieldQueryInput = z.infer<typeof fieldQuerySchema>;
