import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EngineeringSpecialty } from '@qi-conhecimento/shared-types';

export type KnowledgeChunkDocument = HydratedDocument<KnowledgeChunkModel>;

@Schema({
  timestamps: true,
  collection: 'knowledge_chunks',
  toJSON: { virtuals: true },
})
export class KnowledgeChunkModel {
  @Prop({ type: Types.ObjectId, ref: 'KnowledgeDocumentModel', required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ required: true })
  content!: string;

  @Prop({ required: true })
  markdownContent!: string;

  @Prop({ required: true, enum: EngineeringSpecialty, index: true })
  specialty!: EngineeringSpecialty;

  @Prop({ trim: true })
  chapter?: string;

  @Prop({ trim: true })
  section?: string;

  @Prop({ trim: true, index: true })
  normItem?: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ trim: true, index: true })
  embeddingId?: string;

  @Prop({ type: [Number], select: false })
  embedding?: number[];

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;
}

export const KnowledgeChunkSchema = SchemaFactory.createForClass(KnowledgeChunkModel);

KnowledgeChunkSchema.index({ content: 'text', markdownContent: 'text', tags: 'text' });
