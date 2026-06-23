import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LlmConfigDocument = HydratedDocument<LlmConfig>;

export const LLM_CONFIG_SCOPE = 'global';

export type LlmProviderSetting = 'anthropic' | 'openai';
export type EmbeddingProviderSetting = 'ollama' | 'openai';

@Schema({ timestamps: true, collection: 'llm_configs' })
export class LlmConfig {
  @Prop({ type: String, required: true, unique: true, default: LLM_CONFIG_SCOPE })
  scope!: string;

  @Prop({ type: String, enum: ['anthropic', 'openai'], default: 'anthropic' })
  llmProvider!: LlmProviderSetting;

  @Prop({ type: String })
  encryptedAnthropicApiKey?: string;

  @Prop({ type: String })
  encryptedOpenaiApiKey?: string;

  @Prop({ type: String })
  llmModel?: string;

  @Prop({ type: String, enum: ['ollama', 'openai'], default: 'ollama' })
  embeddingProvider!: EmbeddingProviderSetting;

  @Prop({ type: String })
  embeddingModel?: string;
}

export const LlmConfigSchema = SchemaFactory.createForClass(LlmConfig);
