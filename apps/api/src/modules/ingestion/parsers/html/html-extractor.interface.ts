import { ParseResult } from '../parser.interface';

export interface HtmlExtractContext {
  url?: string;
  profileId?: string;
}

export interface HtmlExtractor {
  readonly id: string;
  matchScore?(url: string, html: string): number;
  extract(html: string, context: HtmlExtractContext): Promise<ParseResult>;
}

export interface HtmlExtractorResolveContext {
  url?: string;
  profileId?: string;
  html: string;
}
