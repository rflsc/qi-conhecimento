import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PDFParse } from 'pdf-parse';
import { DoclingClient } from '../services/docling.client';
import { DocumentParser, ParseResult } from './parser.interface';

@Injectable()
export class PdfParser implements DocumentParser {
  constructor(
    private readonly doclingClient: DoclingClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PdfParser.name);
  }

  async parse(input: Buffer | string): Promise<ParseResult> {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

    if (this.doclingClient.isEnabled) {
      try {
        return await this.doclingClient.parse(buffer, 'document.pdf');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'erro desconhecido';
        this.logger.warn({ error: message }, 'Docling indisponível — fallback para pdf-parse local');
      }
    }

    return this.parseLocally(buffer);
  }

  private async parseLocally(buffer: Buffer): Promise<ParseResult> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      const normalized = this.normalizeTables(result.text);
      return { markdown: this.textToMarkdown(normalized) };
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
