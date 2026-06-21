import { Injectable } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { ParseResult } from '../parser.interface';
import { HtmlExtractContext, HtmlExtractor } from './html-extractor.interface';
import { extractBlocksFromHtml } from './html-to-blocks.util';
import { htmlFragmentToMarkdown } from './html-to-markdown.util';

const DEFAULT_BASE_URL = 'https://local.invalid/';
const ENGINE_ID = 'html-readability';

@Injectable()
export class GenericHtmlExtractor implements HtmlExtractor {
  readonly id = 'generic';

  async extract(html: string, context: HtmlExtractContext): Promise<ParseResult> {
    const baseUrl = context.url?.trim() || DEFAULT_BASE_URL;
    const readabilityResult = this.extractWithReadability(html, baseUrl);

    if (readabilityResult) {
      return readabilityResult;
    }

    return this.extractWithHeuristicFallback(html);
  }

  private extractWithReadability(html: string, baseUrl: string): ParseResult | null {
    const dom = new JSDOM(html, { url: baseUrl });
    const document = dom.window.document;
    const article = new Readability(document).parse();

    if (!article?.content?.trim()) {
      return null;
    }

    const title = article.title?.trim() || undefined;
    const blocks = extractBlocksFromHtml(article.content);
    const bodyMarkdown = htmlFragmentToMarkdown(article.content);
    const markdown = this.composeMarkdown(title, bodyMarkdown);

    if (!markdown.trim()) {
      return null;
    }

    return {
      markdown,
      title,
      engine: ENGINE_ID,
      blocks: blocks.length > 0 ? blocks : undefined,
    };
  }

  private extractWithHeuristicFallback(html: string): ParseResult {
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, aside, noscript').remove();

    const title =
      $('title').first().text().trim() ||
      $('h1').first().text().trim() ||
      undefined;

    const contentHtml =
      $('article').first().html()?.trim() ||
      $('main').first().html()?.trim() ||
      $('body').html()?.trim() ||
      '';

    const blocks = contentHtml ? extractBlocksFromHtml(contentHtml) : [];
    const bodyMarkdown = contentHtml
      ? htmlFragmentToMarkdown(contentHtml)
      : $('body').text().trim().replace(/\s+/g, ' ');

    const markdown = this.composeMarkdown(title, bodyMarkdown);

    return {
      markdown,
      title,
      engine: 'html-heuristic',
      blocks: blocks.length > 0 ? blocks : undefined,
    };
  }

  private composeMarkdown(title: string | undefined, bodyMarkdown: string): string {
    const body = bodyMarkdown.trim();
    if (!body) return title ? `# ${title}` : '';

    if (title) {
      const titleHeading = `# ${title}`;
      if (body.startsWith(titleHeading)) return body;
      return `${titleHeading}\n\n${body}`;
    }

    return body;
  }
}
