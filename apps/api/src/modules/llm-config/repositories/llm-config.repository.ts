import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LLM_CONFIG_SCOPE,
  LlmConfig,
  LlmConfigDocument,
} from '../schemas/llm-config.schema';

@Injectable()
export class LlmConfigRepository {
  constructor(
    @InjectModel(LlmConfig.name) private readonly model: Model<LlmConfigDocument>,
  ) {}

  findGlobal(): Promise<LlmConfigDocument | null> {
    return this.model.findOne({ scope: LLM_CONFIG_SCOPE }).exec();
  }

  async upsertGlobal(data: Partial<LlmConfig>): Promise<LlmConfigDocument> {
    return this.model
      .findOneAndUpdate(
        { scope: LLM_CONFIG_SCOPE },
        { $set: data, $setOnInsert: { scope: LLM_CONFIG_SCOPE } },
        { upsert: true, new: true },
      )
      .exec() as Promise<LlmConfigDocument>;
  }
}
