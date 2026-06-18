import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PinoLogger } from 'nestjs-pino';
import { DoclingClient } from '../services/docling.client';
import { DocumentParser, ParseOptions, ParseResult } from './parser.interface';

@Injectable()
export class ImageParser implements DocumentParser {
  private readonly openai: OpenAI | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly doclingClient: DoclingClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ImageParser.name);
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async parse(input: Buffer | string, _options?: ParseOptions): Promise<ParseResult> {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const filename = this.filenameForBuffer(buffer);

    if (this.doclingClient.isEnabled) {
      try {
        return await this.doclingClient.parse(buffer, filename);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'erro desconhecido';
        this.logger.warn({ error: message }, 'Docling indisponível para imagem — fallback Vision');
      }
    }

    return this.parseWithVision(buffer);
  }

  private async parseWithVision(buffer: Buffer): Promise<ParseResult> {
    if (!this.openai) {
      throw new Error('OCR requer PARSER_SERVICE_URL (Docling) ou OPENAI_API_KEY (Vision API)');
    }

    const base64 = buffer.toString('base64');
    const mimeType = this.detectMimeType(buffer);

    const response = await this.openai.chat.completions.create({
      model: this.configService.get<string>('LLM_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extraia todo o texto técnico visível nesta imagem (tabelas, normas, anotações). Retorne em Markdown estruturado com títulos ## quando houver seções. Preserve valores numéricos e referências a normas (NBR).',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const markdown = response.choices[0]?.message?.content?.trim();
    if (!markdown) throw new Error('OCR não retornou conteúdo');

    return { markdown };
  }

  private filenameForBuffer(buffer: Buffer): string {
    const mime = this.detectMimeType(buffer);
    const ext = mime.split('/')[1] ?? 'jpg';
    return `scan.${ext}`;
  }

  private detectMimeType(buffer: Buffer): string {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (buffer.slice(0, 4).toString() === 'RIFF') return 'image/webp';
    return 'image/jpeg';
  }
}
