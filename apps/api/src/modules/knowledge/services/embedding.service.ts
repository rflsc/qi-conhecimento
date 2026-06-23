import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { PinoLogger } from 'nestjs-pino';
import { LlmConfigService } from '@modules/llm-config/services/llm-config.service';

type EmbeddingProvider = 'openai' | 'ollama';

@Injectable()
export class EmbeddingService {
  constructor(
    private readonly llmConfigService: LlmConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmbeddingService.name);
  }

  async isAvailable(): Promise<boolean> {
    const runtime = await this.llmConfigService.resolveEmbeddingRuntime();
    if (runtime.provider === 'ollama') return true;
    return Boolean(runtime.apiKey);
  }

  async activeProvider(): Promise<EmbeddingProvider | null> {
    if (!(await this.isAvailable())) return null;
    const runtime = await this.llmConfigService.resolveEmbeddingRuntime();
    return runtime.provider;
  }

  async unavailableReason(): Promise<string> {
    const runtime = await this.llmConfigService.resolveEmbeddingRuntime();
    if (runtime.provider === 'openai' && !runtime.apiKey) {
      return 'Chave OpenAI ausente — configure em Configurações ou use provedor Ollama';
    }
    return 'Provedor de embedding indisponível';
  }

  async embed(text: string): Promise<number[] | null> {
    if (!(await this.isAvailable())) return null;

    const runtime = await this.llmConfigService.resolveEmbeddingRuntime();
    const input = text.slice(0, 8000);

    if (runtime.provider === 'ollama') {
      return this.embedWithOllama(runtime.ollamaBaseUrl, runtime.model, input);
    }

    return this.embedWithOpenAI(runtime.apiKey, runtime.model, input);
  }

  private async embedWithOpenAI(
    apiKey: string,
    model: string,
    text: string,
  ): Promise<number[] | null> {
    if (!apiKey) return null;

    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({ model, input: text });
    return response.data[0]?.embedding ?? null;
  }

  private async embedWithOllama(
    baseUrl: string,
    model: string,
    text: string,
  ): Promise<number[] | null> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/embeddings`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
      });

      if (!response.ok) {
        const detail = await response.text();
        this.logger.warn({ status: response.status, detail }, 'Ollama embedding falhou');
        return null;
      }

      const payload = (await response.json()) as { embedding?: number[] };
      return payload.embedding?.length ? payload.embedding : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(
        { error: message, url },
        'Ollama indisponível — instale em https://ollama.com e rode: ollama pull nomic-embed-text',
      );
      return null;
    }
  }
}
