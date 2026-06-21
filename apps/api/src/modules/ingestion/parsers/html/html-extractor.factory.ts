import { Injectable } from '@nestjs/common';
import { HtmlExtractor, HtmlExtractorResolveContext } from './html-extractor.interface';
import { GenericHtmlExtractor } from './generic-html.extractor';

@Injectable()
export class HtmlExtractorFactory {
  constructor(private readonly genericExtractor: GenericHtmlExtractor) {}

  resolve(_context: HtmlExtractorResolveContext): HtmlExtractor {
    // Fase 3: auto-detect e perfis declarativos por URL/HTML.
    return this.genericExtractor;
  }
}
