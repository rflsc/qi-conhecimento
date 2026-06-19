import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PDFParse } from 'pdf-parse';
import { DoclingClient } from '../services/docling.client';
import { DoclingRequiredError } from './parser.errors';
import { DocumentParser, ParseOptions, ParseResult } from './parser.interface';

@Injectable()
export class PdfParser implements DocumentParser {
  constructor(
    private readonly doclingClient: DoclingClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PdfParser.name);
  }

  async parse(input: Buffer | string, options?: ParseOptions): Promise<ParseResult> {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const allowFallback = options?.allowWeakParserFallback === true;

    if (!this.doclingClient.isEnabled) {
      if (!allowFallback) {
        throw new DoclingRequiredError(
          'Docling não está configurado. Defina PARSER_SERVICE_URL no .env, rode pnpm parser:dev e reinicie a API. Para usar o parser simples (pdf-parse), marque a opção na tela de importação.',
          'not_configured',
        );
      }
      this.logger.warn('PARSER_SERVICE_URL ausente — pdf-parse habilitado pelo usuário');
      return this.parseLocally(buffer, true);
    }

    try {
      const result = await this.doclingClient.parse(buffer, 'document.pdf', {
        doOcr: options?.doOcr === true,
        onProgress: options?.onParseProgress,
      });
      return { ...result, engine: result.engine ?? 'docling', usedWeakFallback: false, blocks: result.blocks };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'erro desconhecido';
      const timedOut = detail.includes('tempo limite');
      this.logger.warn({ error: detail, timedOut }, 'Docling falhou ao processar PDF');

      if (!allowFallback && !timedOut) {
        throw new DoclingRequiredError(
          `Docling não conseguiu processar o PDF: ${detail}`,
          'parse_failed',
          detail,
        );
      }

      if (timedOut && !allowFallback) {
        this.logger.warn('Docling excedeu o timeout — pdf-parse automático para não perder a ingestão');
      } else {
        this.logger.warn('Usando pdf-parse — fallback autorizado na importação');
      }
      return this.parseLocally(buffer, true);
    }
  }

  private async parseLocally(buffer: Buffer, isFallback: boolean): Promise<ParseResult> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      const normalized = this.normalizeTables(result.text);
      return {
        markdown: this.textToMarkdown(normalized),
        engine: isFallback ? 'pdf-parse (fallback)' : 'pdf-parse',
        usedWeakFallback: isFallback,
      };
    } finally {
      await parser.destroy();
    }
  }

  private normalizeTables(text: string): string {
    return text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.includes('\t') || /\s{3,}/.test(trimmed)) {
          return trimmed.replace(/\t+/g, ' | ').replace(/\s{3,}/g, ' | ');
        }
        return trimmed;
      })
      .join('\n');
  }

  private textToMarkdown(text: string): string {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    return paragraphs
      .map((paragraph) => {
        if (paragraph.includes(' | ') && paragraph.split(' | ').length >= 3) {
          const rows = paragraph.split('\n').filter(Boolean);
          const header = rows[0]?.split(' | ').map((c) => c.trim()) ?? [];
          const separator = header.map(() => '---').join(' | ');
          const body = rows.slice(1).map((row) => row.split(' | ').map((c) => c.trim()).join(' | '));
          return `| ${header.join(' | ')} |\n| ${separator} |\n${body.map((r) => `| ${r} |`).join('\n')}`;
        }
        return paragraph;
      })
      .join('\n\n');
  }
}
