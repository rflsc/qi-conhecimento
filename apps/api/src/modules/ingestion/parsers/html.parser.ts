import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { DocumentParser, ParseOptions, ParseResult } from './parser.interface';

@Injectable()
export class HtmlParser implements DocumentParser {
  async parse(input: Buffer | string, _options?: ParseOptions): Promise<ParseResult> {
    const html = Buffer.isBuffer(input) ? input.toString('utf-8') : input;
    const $ = cheerio.load(html);

    $('script, style, nav, footer, header, aside, noscript').remove();

    const title = $('title').first().text().trim() || $('h1').first().text().trim();
    const article = $('article').text().trim();
    const main = $('main').text().trim();
    const body = $('body').text().trim();
    const content = article || main || body;

    const markdown = content
      .split(/\n{2,}/)
      .map((p) => p.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .join('\n\n');

    return { markdown: title ? `# ${title}\n\n${markdown}` : markdown, title: title || undefined };
  }
}
