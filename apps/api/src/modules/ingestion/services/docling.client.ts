import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { ParseResult } from '../parsers/parser.interface';

interface ParseServiceResponse {
  markdown: string;
  title?: string;
  engine?: string;
}

@Injectable()
export class DoclingClient {
  private readonly baseUrl?: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DoclingClient.name);
    this.baseUrl = this.configService.get<string>('PARSER_SERVICE_URL')?.replace(/\/+$/, '');
    this.timeoutMs = Number(this.configService.get<string>('PARSER_SERVICE_TIMEOUT_MS') ?? 120_000);
  }

  get isEnabled(): boolean {
    return Boolean(this.baseUrl);
  }

  async parse(buffer: Buffer, filename: string): Promise<ParseResult> {
    if (!this.baseUrl) {
      throw new Error('PARSER_SERVICE_URL não configurado');
    }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), filename);

    const response = await fetch(`${this.baseUrl}/v1/parse`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Parser service HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await response.json()) as ParseServiceResponse;
    return { markdown: data.markdown, title: data.title };
  }
}
