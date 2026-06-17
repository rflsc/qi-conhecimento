import { Injectable } from '@nestjs/common';
import { DocumentSourceType } from '@qi-conhecimento/shared-types';
import { DocumentParser } from './parser.interface';
import { HtmlParser } from './html.parser';
import { ImageParser } from './image.parser';
import { PdfParser } from './pdf.parser';

@Injectable()
export class ParserFactory {
  constructor(
    private readonly pdfParser: PdfParser,
    private readonly imageParser: ImageParser,
    private readonly htmlParser: HtmlParser,
  ) {}

  getParser(sourceType: DocumentSourceType): DocumentParser {
    switch (sourceType) {
      case DocumentSourceType.PDF:
        return this.pdfParser;
      case DocumentSourceType.IMAGE:
        return this.imageParser;
      case DocumentSourceType.HTML:
      case DocumentSourceType.LINK:
        return this.htmlParser;
      default:
        throw new Error(`Tipo de fonte não suportado para parsing: ${sourceType}`);
    }
  }
}
