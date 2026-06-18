import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import * as http from 'node:http';
import * as https from 'node:https';
import { randomBytes } from 'node:crypto';
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

  async checkHealth(): Promise<{ configured: boolean; reachable: boolean; engine?: string }> {
    if (!this.baseUrl) {
      return { configured: false, reachable: false };
    }

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return { configured: true, reachable: false };
      }
      const payload = (await response.json()) as { engine?: string };
      return { configured: true, reachable: true, engine: payload.engine ?? 'docling' };
    } catch {
      return { configured: true, reachable: false, engine: 'docling' };
    }
  }

  async parse(buffer: Buffer, filename: string, options?: { doOcr?: boolean }): Promise<ParseResult> {
    if (!this.baseUrl) {
      throw new Error('PARSER_SERVICE_URL não configurado');
    }

    const health = await this.checkHealth();
    if (!health.reachable) {
      throw new Error(
        `Serviço Docling inacessível em ${this.baseUrl}. Rode pnpm parser:dev e aguarde "Parser service pronto" antes de importar.`,
      );
    }

    const url = `${this.baseUrl}/v1/parse`;
    const sizeMbNum = buffer.length / (1024 * 1024);
    const sizeMb = sizeMbNum.toFixed(1);
    const timeoutMs = this.resolveTimeoutMs(buffer.length);
    this.logger.info(
      { url, filename, sizeMb, timeoutMs, configuredTimeoutMs: this.timeoutMs, doOcr: options?.doOcr === true },
      'Enviando PDF ao Docling',
    );

    // Usa node:http diretamente (não o fetch global): o undici embutido no Node
    // impõe headersTimeout/bodyTimeout de 5 min que não respeitam o AbortSignal,
    // causando "fetch failed" em PDFs longos. Aqui controlamos o timeout por conta própria.
    const data = await this.postMultipart(url, buffer, filename, sizeMb, timeoutMs, options?.doOcr);
    return { markdown: data.markdown, title: data.title, engine: data.engine ?? 'docling' };
  }

  /** Estima timeout mínimo (~4 min/MB em CPU); respeita PARSER_SERVICE_TIMEOUT_MS se maior. */
  private resolveTimeoutMs(fileBytes: number): number {
    const sizeMb = fileBytes / (1024 * 1024);
    const estimated = Math.ceil(480_000 + sizeMb * 240_000);
    const cap = 3_600_000;
    return Math.min(Math.max(this.timeoutMs, estimated), cap);
  }

  private postMultipart(
    url: string,
    fileBuffer: Buffer,
    filename: string,
    sizeMb: string,
    timeoutMs: number,
    doOcr?: boolean,
  ): Promise<ParseServiceResponse> {
    const target = new URL(url);
    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? https : http;
    const boundary = `----qiParser${randomBytes(16).toString('hex')}`;

    const ocrPart =
      doOcr === true
        ? Buffer.from(
            `--${boundary}\r\n` +
              `Content-Disposition: form-data; name="do_ocr"\r\n\r\n` +
              `true\r\n`,
            'utf-8',
          )
        : Buffer.alloc(0);

    const header = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`,
      'utf-8',
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([ocrPart, header, fileBuffer, footer]);

    const options: http.RequestOptions = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    return new Promise<ParseServiceResponse>((resolve, reject) => {
      const req = transport.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const status = res.statusCode ?? 0;

          if (status < 200 || status >= 300) {
            reject(new Error(`Parser service HTTP ${status}: ${raw.slice(0, 200)}`));
            return;
          }

          try {
            resolve(JSON.parse(raw) as ParseServiceResponse);
          } catch {
            reject(new Error(`Resposta inválida do Docling: ${raw.slice(0, 200)}`));
          }
        });
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy(
          new Error(
            `Docling excedeu o tempo limite (${Math.round(timeoutMs / 1000)}s) para um PDF de ${sizeMb} MB. Aumente PARSER_SERVICE_TIMEOUT_MS no .env e reinicie a API, ou marque fallback pdf-parse na importação.`,
          ),
        );
      });

      req.on('error', (error: NodeJS.ErrnoException) => {
        reject(new Error(this.describeRequestError(error, sizeMb)));
      });

      req.write(body);
      req.end();
    });
  }

  private describeRequestError(error: NodeJS.ErrnoException, sizeMb: string): string {
    const code = error.code ?? '';
    const base = error.message || 'erro desconhecido';

    if (base.includes('tempo limite')) {
      return base;
    }

    if (code === 'ECONNREFUSED') {
      return `Não foi possível conectar ao Docling em ${this.baseUrl}. O serviço não estava rodando. Rode pnpm parser:dev, aguarde "Parser service pronto" e tente de novo.`;
    }

    if (code === 'ECONNRESET') {
      return `Conexão com o Docling foi interrompida durante o PDF de ${sizeMb} MB. O parser pode ter reiniciado (uvicorn --reload) ou ficado sem memória.`;
    }

    return `Docling indisponível: ${base}${code ? ` (${code})` : ''}`;
  }
}
