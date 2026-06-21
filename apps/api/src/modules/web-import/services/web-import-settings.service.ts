import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WebImportSettings } from '@qi-conhecimento/shared-types';
import {
  DEFAULT_WEB_IMPORT_SETTINGS,
  WEB_IMPORT_SETTINGS_KEY,
  WebImportSettingsEntity,
  WebImportSettingsModel,
} from '../schemas/web-import-settings.schema';

@Injectable()
export class WebImportSettingsService implements OnModuleInit {
  private cache: WebImportSettings | null = null;

  constructor(
    @InjectModel(WebImportSettingsModel.name)
    private readonly settingsModel: Model<WebImportSettingsEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.getSettings();
  }

  async getSettings(): Promise<WebImportSettings> {
    if (this.cache) return this.cache;

    let doc = await this.settingsModel.findOne({ key: WEB_IMPORT_SETTINGS_KEY }).exec();
    if (!doc) {
      doc = await this.settingsModel.create({ ...DEFAULT_WEB_IMPORT_SETTINGS });
    }

    this.cache = this.map(doc);
    return this.cache;
  }

  async updateSettings(input: Omit<WebImportSettings, 'updatedAt'>): Promise<WebImportSettings> {
    const doc = await this.settingsModel
      .findOneAndUpdate(
        { key: WEB_IMPORT_SETTINGS_KEY },
        {
          maxPages: input.maxPages,
          maxDepth: input.maxDepth,
          rateLimitMs: input.rateLimitMs,
          fetchTimeoutMs: input.fetchTimeoutMs,
          userAgent: input.userAgent,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    this.cache = this.map(doc);
    return this.cache;
  }

  private map(doc: WebImportSettingsEntity): WebImportSettings {
    const timestamps = doc as WebImportSettingsEntity & { updatedAt?: Date };
    return {
      maxPages: doc.maxPages,
      maxDepth: doc.maxDepth,
      rateLimitMs: doc.rateLimitMs,
      fetchTimeoutMs: doc.fetchTimeoutMs,
      userAgent: doc.userAgent,
      updatedAt: timestamps.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
