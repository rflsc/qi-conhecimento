import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EngineeringSpecialty, MessagingChannel } from '@qi-conhecimento/shared-types';

export type FieldQueryDocument = HydratedDocument<FieldQueryModel>;

@Schema({ _id: false })
export class CitationSubdocument {
  @Prop({ required: true })
  documentId!: string;

  @Prop({ required: true })
  documentTitle!: string;

  @Prop()
  normReference?: string;

  @Prop()
  normItem?: string;

  @Prop({ required: true })
  chunkId!: string;

  @Prop({ required: true })
  excerpt!: string;

  @Prop()
  sourceUrl?: string;
}

@Schema({
  timestamps: true,
  collection: 'field_queries',
  toJSON: { virtuals: true },
})
export class FieldQueryModel {
  @Prop({ required: true, enum: MessagingChannel, index: true })
  channel!: MessagingChannel;

  @Prop({ required: true, index: true })
  externalUserId!: string;

  @Prop({ required: true })
  queryText!: string;

  @Prop({ default: false })
  transcribedFromAudio!: boolean;

  @Prop({ enum: EngineeringSpecialty })
  specialtyFilter?: EngineeringSpecialty;

  @Prop()
  answer?: string;

  @Prop({ type: [CitationSubdocument], default: [] })
  citations!: CitationSubdocument[];

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;
}

export const FieldQuerySchema = SchemaFactory.createForClass(FieldQueryModel);
