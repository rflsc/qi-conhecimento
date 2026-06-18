export interface ParseResult {
  markdown: string;
  title?: string;
  engine?: string;
  usedWeakFallback?: boolean;
}

export interface ParseOptions {
  /** Permite pdf-parse quando Docling falha ou não está configurado (qualidade inferior). */
  allowWeakParserFallback?: boolean;
  /** Ativa OCR no Docling para este parse (PDF escaneado). */
  doOcr?: boolean;
}

export interface DocumentParser {
  parse(input: Buffer | string, options?: ParseOptions): Promise<ParseResult>;
}