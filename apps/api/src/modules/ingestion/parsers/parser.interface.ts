import { ChunkContentType, ParseBlock, TableExtractionSource } from '@qi-conhecimento/shared-types';

export interface ParseResult {
  markdown: string;
  title?: string;
  engine?: string;
  usedWeakFallback?: boolean;
  blocks?: ParseBlock[];
}

export interface ParseProgressUpdate {
  status: 'pending' | 'running' | 'completed' | 'failed';
  pagesTotal: number;
  pagesDone: number;
  batchIndex?: number;
  batchCount?: number;
  batchStartPage?: number;
  batchEndPage?: number;
  message?: string;
}

export interface ParseOptions {
  /** Permite pdf-parse quando Docling falha ou não está configurado (qualidade inferior). */
  allowWeakParserFallback?: boolean;
  /** Ativa OCR no Docling para este parse (PDF escaneado). */
  doOcr?: boolean;
  /** Recebe progresso por página/lote enquanto o Docling processa (PDF via parser service). */
  onParseProgress?: (update: ParseProgressUpdate) => void;
}

export interface DocumentParser {
  parse(input: Buffer | string, options?: ParseOptions): Promise<ParseResult>;
}

export interface ChunkSegment {
  chapter: string;
  section?: string;
  markdownContent: string;
  normItem?: string;
  pageStart?: number;
  pageEnd?: number;
  contentType?: ChunkContentType;
  headingPath?: string[];
  tableCaption?: string;
  tableSource?: TableExtractionSource;
}
