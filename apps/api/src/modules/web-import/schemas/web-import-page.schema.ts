import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WebImportPageStatus } from '@qi-conhecimento/shared-types';

export type WebImportPageEntity = HydratedDocument<WebImportPageModel>;

@Schema({
  timestamps: true,
  collection: 'web_import_pages',
  toJSON: { virtuals: true },
})
export class WebImportPageModel {
  @Prop({ type: Types.ObjectId, ref: 'WebImportJobModel', required: true, index: true })
  jobId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  url!: string;

  @Prop({ trim: true })
  canonicalUrl?: string;

  @Prop({ trim: true })
  title?: string;

  @Prop({ required: true, enum: WebImportPageStatus, default: WebImportPageStatus.PENDING, index: true })
  status!: WebImportPageStatus;

  @Prop({ type: Types.ObjectId, ref: 'KnowledgeDocumentModel' })
  documentId?: Types.ObjectId;

  @Prop({ trim: true })
  error?: string;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;
}

export const WebImportPageSchema = SchemaFactory.createForClass(WebImportPageModel);
WebImportPageSchema.index({ jobId: 1, url: 1 }, { unique: true });
WebImportPageSchema.index({ jobId: 1, status: 1 });
