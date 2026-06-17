export interface ParseResult {
  markdown: string;
  title?: string;
}

export interface DocumentParser {
  parse(input: Buffer | string): Promise<ParseResult>;
}
