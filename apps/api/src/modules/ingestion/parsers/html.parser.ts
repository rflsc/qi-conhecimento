import { Injectable } from '@nestjs/common';
import { DocumentParser, ParseOptions, ParseResult } from './parser.interface';
import { HtmlExtractorFactory } from './html/html-extractor.factory';

@Injectable()
export class HtmlParser implements DocumentParser {
  constructor(private readonly extractorFactory: HtmlExtractorFactory) {}

  async parse(input: Buffer | string, options?: ParseOptions): Promise<ParseResult> {
    const html = Buffer.isBuffer(input) ? input.toString('utf-8') : input;
    const extractor = this.extractorFactory.resolve({
      url: options?.sourceUrl,
      profileId: options?.profileId,
      html,
    });

    return extractor.extract(html, {
      url: options?.sourceUrl,
      profileId: options?.profileId,
    });
  }
}
