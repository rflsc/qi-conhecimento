import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  EngineeringSpecialty,
  WebDiscoveryStrategy,
  WebImportJobStatus,
} from '@qi-conhecimento/shared-types';

export type WebImportJobEntity = HydratedDocument<WebImportJobModel>;

@Schema({ _id: false })
export class WebImportJobConfigModel {
  @Prop({ required: true, trim: true })
  seedUrl!: string;

  @Prop({ required: true, enum: WebDiscoveryStrategy })
  discovery!: WebDiscoveryStrategy;

  @Prop({ trim: true })
  profileId?: string;

  @Prop({ default: 500 })
  maxPages!: number;

  @Prop({ default: 3 })
  maxDepth!: number;

  @Prop({ default: true })
  sameOriginOnly!: boolean;

  @Prop({ trim: true })
  pathPrefix?: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ default: 1000 })
  rateLimitMs!: number;
}

@Schema({
  timestamps: true,
  collection: 'web_import_jobs',
  toJSON: { virtuals: true },
})
export class WebImportJobModel {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, enum: EngineeringSpecialty, index: true })
  specialty!: EngineeringSpecialty;

  @Prop({ trim: true })
  normReference?: string;

  @Prop({ trim: true })
  author?: string;

  @Prop({ type: WebImportJobConfigModel, required: true })
  config!: WebImportJobConfigModel;

  @Prop({ required: true, enum: WebImportJobStatus, default: WebImportJobStatus.PENDING, index: true })
  status!: WebImportJobStatus;

  @Prop({ default: 0 })
  pagesDiscovered!: number;

  @Prop({ default: 0 })
  pagesCompleted!: number;

  @Prop({ default: 0 })
  pagesFailed!: number;

  @Prop({ default: 0 })
  pagesSkipped!: number;

  @Prop({ type: Types.ObjectId, ref: 'KnowledgeDocumentModel', index: true })
  documentId?: Types.ObjectId;

  @Prop({ trim: true })
  error?: string;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;
}

export const WebImportJobSchema = SchemaFactory.createForClass(WebImportJobModel);
