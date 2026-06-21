import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebImportSettingsEntity = HydratedDocument<WebImportSettingsModel>;

export const WEB_IMPORT_SETTINGS_KEY = 'default';

export const DEFAULT_WEB_IMPORT_SETTINGS = {
  key: WEB_IMPORT_SETTINGS_KEY,
  maxPages: 500,
  maxDepth: 3,
  rateLimitMs: 1000,
  fetchTimeoutMs: 30_000,
  userAgent: 'QiConhecimento/1.0 (+https://altoqi.com)',
} as const;

@Schema({
  timestamps: true,
  collection: 'web_import_settings',
})
export class WebImportSettingsModel {
  @Prop({ required: true, unique: true, default: WEB_IMPORT_SETTINGS_KEY })
  key!: string;

  @Prop({ required: true, default: DEFAULT_WEB_IMPORT_SETTINGS.maxPages })
  maxPages!: number;

  @Prop({ required: true, default: DEFAULT_WEB_IMPORT_SETTINGS.maxDepth })
  maxDepth!: number;

  @Prop({ required: true, default: DEFAULT_WEB_IMPORT_SETTINGS.rateLimitMs })
  rateLimitMs!: number;

  @Prop({ required: true, default: DEFAULT_WEB_IMPORT_SETTINGS.fetchTimeoutMs })
  fetchTimeoutMs!: number;

  @Prop({ required: true, trim: true, default: DEFAULT_WEB_IMPORT_SETTINGS.userAgent })
  userAgent!: string;
}

export const WebImportSettingsSchema = SchemaFactory.createForClass(WebImportSettingsModel);
