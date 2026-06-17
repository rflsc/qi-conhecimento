import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PinoLogger } from 'nestjs-pino';

type EmbeddingProvider = 'openai' | 'ollama';

@Injectable()
export class EmbeddingService {
  private readonly provider: EmbeddingProvider;
  private readonly openai: OpenAI | null;
  private readonly model: string;
  private readonly ollamaBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmbeddingService.name);
    this.provider = this.resolveProvider();
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model =
      this.configService.get<string>('EMBEDDING_MODEL') ??
      (this.provider === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small');
    this.ollamaBaseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';

    if (this.isAvailable) {
      this.logger.info({ provider: this.provider, model: this.model }, 'Provedor de embedding ativo');
    }
  }

  get isAvailable(): boolean {
    if (this.provider === 'ollama') return true;
    return this.openai !== null;
  }

  get activeProvider(): EmbeddingProvider | null {
    return this.isAvailable ? this.provider : null;
  }

  unavailableReason(): string {
    if (this.provider === 'openai') {
      return 'OPENAI_API_KEY ausente — use EMBEDDING_PROVIDER=ollama para embeddings locais gratuitos';
    }
    return 'Provedor de embedding indisponível';
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.isAvailable) return null;

    const input = text.slice(0, 8000);

    if (this.provider === 'ollama') {
      return this.embedWithOllama(input);
    }

    return this.embedWithOpenAI(input);
  }

  private resolveProvider(): EmbeddingProvider {
    const configured = this.configService.get<string>('EMBEDDING_PROVIDER')?.toLowerCase();
    if (configured === 'ollama' || configured === 'openai') {
      return configured;
    }
    return this.configService.get<string>('OPENAI_API_KEY') ? 'openai' : 'ollama';
  }

  private async embedWithOpenAI(text: string): Promise<number[] | null> {
    if (!this.openai) return null;

    const response = await this.openai.embeddings.create({
      model: this.model,
      input: text,
    });

    return response.data[0]?.embedding ?? null;
  }

  private async embedWithOllama(text: string): Promise<number[] | null> {
    const url = `${this.ollamaBaseUrl.replace(/\/$/, '')}/api/embeddings`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
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
