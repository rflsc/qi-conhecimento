import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import * as http from 'node:http';
import * as https from 'node:https';
import { randomBytes, randomUUID } from 'node:crypto';
import { ParseProgressUpdate, ParseResult } from '../parsers/parser.interface';

interface ParseServiceResponse {
  markdown: string;
  title?: string;
  engine?: string;
}

interface ParseProgressResponse {
  job_id: string;
  status: string;
  pages_total: number;
  pages_done: number;
  batch_index: number;
  batch_count: number;
  batch_start_page: number;
  batch_end_page: number;
  message: string;
}

/** Timeout padrão para parse Docling (PDFs grandes em CPU podem levar >30 min). */
const DEFAULT_PARSER_TIMEOUT_MS = 7_200_000; // 2 horas
const PROGRESS_POLL_MS = 3_000;

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
    this.timeoutMs = Number(
      this.configService.get<string>('PARSER_SERVICE_TIMEOUT_MS') ?? DEFAULT_PARSER_TIMEOUT_MS,
    );
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

  async parse(
    buffer: Buffer,
    filename: string,
    options?: { doOcr?: boolean; onProgress?: (update: ParseProgressUpdate) => void },
  ): Promise<ParseResult> {
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
    const jobId = randomUUID();
    const pollProgress = Boolean(options?.onProgress);
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let lastSignature = '';

    if (pollProgress) {
      const emitProgress = (progress: ParseProgressResponse | null) => {
        if (!progress) return;
        const signature = `${progress.status}:${progress.pages_done}:${progress.batch_index}:${progress.message}`;
        if (signature === lastSignature) return;
        lastSignature = signature;
        options?.onProgress?.(this.mapProgressResponse(progress));
      };

      void this.fetchParseProgress(jobId).then(emitProgress).catch(() => undefined);

      pollTimer = setInterval(() => {
        void this.fetchParseProgress(jobId).then(emitProgress).catch(() => undefined);
      }, PROGRESS_POLL_MS);
    }

    this.logger.info(
      {
        url,
        filename,
        sizeMb,
        timeoutMs,
        configuredTimeoutMs: this.timeoutMs,
        doOcr: options?.doOcr === true,
        jobId: pollProgress ? jobId : undefined,
      },
      'Enviando PDF ao Docling',
    );

    try {
      const data = await this.postMultipart(
        url,
        buffer,
        filename,
        sizeMb,
        timeoutMs,
        options?.doOcr,
        pollProgress ? jobId : undefined,
      );
      return { markdown: data.markdown, title: data.title, engine: data.engine ?? 'docling' };
    } finally {
      if (pollTimer) clearInterval(pollTimer);
    }
  }

  /** Usa PARSER_SERVICE_TIMEOUT_MS; nunca abaixo da estimativa por tamanho (~4 min/MB em CPU). */
  private resolveTimeoutMs(fileBytes: number): number {
    const sizeMb = fileBytes / (1024 * 1024);
    const estimated = Math.ceil(480_000 + sizeMb * 240_000);
    return Math.max(this.timeoutMs, estimated);
  }

  private postMultipart(
    url: string,
    fileBuffer: Buffer,
    filename: string,
    sizeMb: string,
    timeoutMs: number,
    doOcr?: boolean,
    jobId?: string,
  ): Promise<ParseServiceResponse> {
    const target = new URL(url);
    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? https : http;
    const boundary = `----qiParser${randomBytes(16).toString('hex')}`;

    const formParts: Buffer[] = [];

    if (doOcr === true) {
      formParts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="do_ocr"\r\n\r\n` +
            `true\r\n`,
          'utf-8',
        ),
      );
    }

    if (jobId) {
      formParts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="job_id"\r\n\r\n` +
            `${jobId}\r\n`,
          'utf-8',
        ),
      );
    }

    const header = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`,
      'utf-8',
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([...formParts, header, fileBuffer, footer]);

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

  private fetchParseProgress(jobId: string): Promise<ParseProgressResponse | null> {
    if (!this.baseUrl) return Promise.resolve(null);

    const url = `${this.baseUrl}/v1/parse/progress/${jobId}`;
    const target = new URL(url);
    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? https : http;

    return new Promise((resolve) => {
      const req = transport.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (isHttps ? 443 : 80),
          path: target.pathname + target.search,
          method: 'GET',
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            if ((res.statusCode ?? 0) !== 200) {
              resolve(null);
              return;
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as ParseProgressResponse);
            } catch {
              resolve(null);
            }
          });
        },
      );

      req.setTimeout(5_000, () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  private mapProgressResponse(progress: ParseProgressResponse): ParseProgressUpdate {
    const status =
      progress.status === 'completed' ||
      progress.status === 'failed' ||
      progress.status === 'pending' ||
      progress.status === 'running'
        ? progress.status
        : 'running';

    return {
      status,
      pagesTotal: progress.pages_total,
      pagesDone: progress.pages_done,
      batchIndex: progress.batch_index || undefined,
      batchCount: progress.batch_count || undefined,
      batchStartPage: progress.batch_start_page || undefined,
      batchEndPage: progress.batch_end_page || undefined,
      message: progress.message || undefined,
    };
  }
}
