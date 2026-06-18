import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  DocumentSourceType,
  EngineeringSpecialty,
  IngestionStatus,
} from '@qi-conhecimento/shared-types';

export type KnowledgeDocumentEntity = HydratedDocument<KnowledgeDocumentModel>;

@Schema({
  timestamps: true,
  collection: 'knowledge_documents',
  toJSON: { virtuals: true },
})
export class KnowledgeDocumentModel {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, enum: EngineeringSpecialty, index: true })
  specialty!: EngineeringSpecialty;

  @Prop({ required: true, enum: DocumentSourceType, index: true })
  sourceType!: DocumentSourceType;

  @Prop({ trim: true })
  sourceReference?: string;

  @Prop({ trim: true, index: true })
  normReference?: string;

  @Prop({ trim: true })
  author?: string;

  @Prop({ required: true, enum: IngestionStatus, default: IngestionStatus.PENDING })
  ingestionStatus!: IngestionStatus;

  @Prop({ trim: true })
  ingestionError?: string;

  @Prop({ trim: true })
  parseQualityWarning?: string;

  @Prop({ default: false })
  offerOcrRetry?: boolean;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;
}

export const KnowledgeDocumentSchema = SchemaFactory.createForClass(KnowledgeDocumentModel);
