import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialEncryptionService } from '@common/services/credential-encryption.service';
import { LlmConfigRepository } from '../repositories/llm-config.repository';
import {
  EmbeddingProviderSetting,
  LlmConfigDocument,
  LlmProviderSetting,
} from '../schemas/llm-config.schema';
import { UpdateLlmConfigDto } from '../dto/llm-config.dto';

export type ConfigSource = 'environment' | 'database' | 'mixed';

export interface ProviderKeyStatus {
  hasApiKey: boolean;
  apiKeyMasked: string;
  source: ConfigSource;
}

export interface AiConfigResponse {
  llmProvider: LlmProviderSetting;
  llmModel: string;
  embeddingProvider: EmbeddingProviderSetting;
  embeddingModel: string;
  anthropic: ProviderKeyStatus;
  openai: ProviderKeyStatus;
}

export interface ResolvedLlmRuntime {
  provider: LlmProviderSetting | null;
  model: string;
  apiKey: string;
}

export interface ResolvedEmbeddingRuntime {
  provider: EmbeddingProviderSetting;
  model: string;
  apiKey: string;
  ollamaBaseUrl: string;
}

const DEFAULT_LLM_MODEL: Record<LlmProviderSetting, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
};

const DEFAULT_EMBEDDING_MODEL: Record<EmbeddingProviderSetting, string> = {
  ollama: 'nomic-embed-text',
  openai: 'text-embedding-3-small',
};

@Injectable()
export class LlmConfigService {
  constructor(
    private readonly repository: LlmConfigRepository,
    private readonly configService: ConfigService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async getConfig(): Promise<AiConfigResponse> {
    const doc = await this.repository.findGlobal();
    const llmProvider = this.resolveLlmProvider(doc);
    const embeddingProvider = this.resolveEmbeddingProvider(doc);

    return {
      llmProvider,
      llmModel: this.resolveLlmModel(doc, llmProvider),
      embeddingProvider,
      embeddingModel: this.resolveEmbeddingModel(doc, embeddingProvider),
      anthropic: this.buildProviderKeyStatus(
        doc,
        'anthropic',
        await this.resolveApiKeyForProvider(doc, 'anthropic'),
      ),
      openai: this.buildProviderKeyStatus(
        doc,
        'openai',
        await this.resolveApiKeyForProvider(doc, 'openai'),
      ),
    };
  }

  async updateConfig(dto: UpdateLlmConfigDto): Promise<AiConfigResponse> {
    const patch: Record<string, unknown> = {};

    if (dto.llmProvider !== undefined) patch.llmProvider = dto.llmProvider;
    if (dto.llmModel !== undefined) patch.llmModel = dto.llmModel;
    if (dto.embeddingProvider !== undefined) patch.embeddingProvider = dto.embeddingProvider;
    if (dto.embeddingModel !== undefined) patch.embeddingModel = dto.embeddingModel;
    if (dto.anthropicApiKey?.trim()) {
      patch.encryptedAnthropicApiKey = this.encryptSecret(dto.anthropicApiKey.trim());
    }
    if (dto.openaiApiKey?.trim()) {
      patch.encryptedOpenaiApiKey = this.encryptSecret(dto.openaiApiKey.trim());
    }

    if (Object.keys(patch).length > 0) {
      await this.repository.upsertGlobal(patch);
    }

    return this.getConfig();
  }

  async resolveLlmRuntime(): Promise<ResolvedLlmRuntime> {
    const doc = await this.repository.findGlobal();
    const provider = this.resolveActiveLlmProvider(doc);
    if (!provider) {
      return { provider: null, model: DEFAULT_LLM_MODEL.openai, apiKey: '' };
    }

    const apiKey = await this.resolveApiKeyForProvider(doc, provider);
    if (!apiKey) {
      return { provider: null, model: DEFAULT_LLM_MODEL[provider], apiKey: '' };
    }

    return {
      provider,
      model: this.resolveLlmModel(doc, provider),
      apiKey,
    };
  }

  async resolveEmbeddingRuntime(): Promise<ResolvedEmbeddingRuntime> {
    const doc = await this.repository.findGlobal();
    const provider = this.resolveEmbeddingProvider(doc);
    const apiKey =
      provider === 'openai' ? await this.resolveApiKeyForProvider(doc, 'openai') : '';

    return {
      provider,
      model: this.resolveEmbeddingModel(doc, provider),
      apiKey,
      ollamaBaseUrl:
        this.configService.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434',
    };
  }

  private resolveLlmProvider(doc: LlmConfigDocument | null): LlmProviderSetting {
    return doc?.llmProvider ?? 'anthropic';
  }

  private resolveActiveLlmProvider(doc: LlmConfigDocument | null): LlmProviderSetting | null {
    const configured = this.resolveLlmProvider(doc);
    return configured;
  }

  private resolveEmbeddingProvider(doc: LlmConfigDocument | null): EmbeddingProviderSetting {
    return doc?.embeddingProvider ?? 'ollama';
  }

  private resolveLlmModel(
    doc: LlmConfigDocument | null,
    provider: LlmProviderSetting,
  ): string {
    return (
      doc?.llmModel?.trim() ||
      this.configService.get<string>('LLM_MODEL') ||
      DEFAULT_LLM_MODEL[provider]
    );
  }

  private resolveEmbeddingModel(
    doc: LlmConfigDocument | null,
    provider: EmbeddingProviderSetting,
  ): string {
    return (
      doc?.embeddingModel?.trim() ||
      this.configService.get<string>('EMBEDDING_MODEL') ||
      DEFAULT_EMBEDDING_MODEL[provider]
    );
  }

  async resolveApiKeyForProvider(
    doc: LlmConfigDocument | null,
    provider: LlmProviderSetting,
  ): Promise<string> {
    const resolvedDoc = doc ?? (await this.repository.findGlobal());

    if (provider === 'anthropic' && resolvedDoc?.encryptedAnthropicApiKey) {
      const dbKey = this.decryptSecret(resolvedDoc.encryptedAnthropicApiKey);
      if (dbKey) return dbKey;
    }
    if (provider === 'openai' && resolvedDoc?.encryptedOpenaiApiKey) {
      const dbKey = this.decryptSecret(resolvedDoc.encryptedOpenaiApiKey);
      if (dbKey) return dbKey;
    }

    return provider === 'anthropic'
      ? this.getEnvAnthropicApiKey()
      : this.getEnvOpenaiApiKey();
  }

  private buildProviderKeyStatus(
    doc: LlmConfigDocument | null,
    provider: LlmProviderSetting,
    resolvedKey: string,
  ): ProviderKeyStatus {
    const envKey =
      provider === 'anthropic' ? this.getEnvAnthropicApiKey() : this.getEnvOpenaiApiKey();
    const dbKey = doc ? this.getDbKeyForProvider(doc, provider) : '';

    let source: ConfigSource = 'environment';
    if (dbKey) {
      source = envKey ? 'mixed' : 'database';
    }

    return {
      hasApiKey: Boolean(resolvedKey),
      apiKeyMasked: resolvedKey ? this.encryption.mask(resolvedKey) : '',
      source,
    };
  }

  private getDbKeyForProvider(doc: LlmConfigDocument, provider: LlmProviderSetting): string {
    if (provider === 'anthropic' && doc.encryptedAnthropicApiKey) {
      return this.decryptSecret(doc.encryptedAnthropicApiKey);
    }
    if (provider === 'openai' && doc.encryptedOpenaiApiKey) {
      return this.decryptSecret(doc.encryptedOpenaiApiKey);
    }
    return '';
  }

  private getEnvAnthropicApiKey(): string {
    return this.sanitizeEnvSecret(this.configService.get<string>('ANTHROPIC_API_KEY', ''));
  }

  private getEnvOpenaiApiKey(): string {
    return this.sanitizeEnvSecret(this.configService.get<string>('OPENAI_API_KEY', ''));
  }

  private sanitizeEnvSecret(raw: string): string {
    if (!raw) return '';
    return raw.split('#')[0]?.trim() || '';
  }

  private encryptSecret(value: string): string {
    return this.encryption.encrypt({ apiKey: value });
  }

  private decryptSecret(encrypted: string): string {
    try {
      return this.encryption.decrypt(encrypted).apiKey || '';
    } catch {
      return '';
    }
  }
}
