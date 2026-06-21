import { DocumentSourceType } from '@qi-conhecimento/shared-types';

const MIN_EXTRACTED_CHARS = 1024;
const MIN_PAGES_FOR_WARNING = 2;
const MIN_FILE_BYTES_FOR_WARNING = 200 * 1024;
const MIN_CHARS_PER_PAGE = 150;

const MIN_HTML_EXTRACTED_CHARS = 200;
const MIN_HTML_RAW_TEXT_CHARS = 5000;
const MIN_HTML_EXTRACTION_RATIO = 0.05;

export interface ParseQualityAssessment {
  suspicious: boolean;
  message?: string;
}

/** Contagem heurística de páginas em PDF (sem parser completo). */
export function countPdfPages(buffer: Buffer): number | null {
  try {
    const body = buffer.toString('latin1');
    const matches = body.match(/\/Type\s*\/Page(?!s)/g);
    if (!matches || matches.length === 0) return null;
    return matches.length;
  } catch {
    return null;
  }
}

function assessHtmlParseQuality(options: {
  rawInput: Buffer | string;
  extractedChars: number;
}): ParseQualityAssessment {
  const html = Buffer.isBuffer(options.rawInput)
    ? options.rawInput.toString('utf-8')
    : options.rawInput;
  const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  if (options.extractedChars < MIN_HTML_EXTRACTED_CHARS) {
    return {
      suspicious: true,
      message: `Extração HTML muito curta: só ${options.extractedChars.toLocaleString('pt-BR')} caracteres. A página pode exigir perfil customizado ou renderização JavaScript.`,
    };
  }

  if (
    visibleText.length >= MIN_HTML_RAW_TEXT_CHARS &&
    options.extractedChars / visibleText.length < MIN_HTML_EXTRACTION_RATIO
  ) {
    return {
      suspicious: true,
      message:
        'Extração HTML suspeita: muito conteúdo visível na página, mas pouco texto útil foi capturado (navegação, sidebar ou layout complexo).',
    };
  }

  return { suspicious: false };
}

export function assessParseQuality(options: {
  sourceType: DocumentSourceType;
  rawInput: Buffer | string;
  extractedChars: number;
}): ParseQualityAssessment {
  if (
    options.sourceType === DocumentSourceType.LINK ||
    options.sourceType === DocumentSourceType.HTML
  ) {
    return assessHtmlParseQuality(options);
  }

  if (options.sourceType !== DocumentSourceType.PDF) {
    return { suspicious: false };
  }

  const trimmedLength = options.extractedChars;
  if (trimmedLength >= MIN_EXTRACTED_CHARS) {
    return { suspicious: false };
  }

  if (!Buffer.isBuffer(options.rawInput)) {
    return { suspicious: false };
  }

  const buffer = options.rawInput;
  const pageCount = countPdfPages(buffer);
  const fileSizeKb = Math.round(buffer.length / 1024);
  const charsPerPage =
    pageCount && pageCount > 0 ? Math.round(trimmedLength / pageCount) : null;

  let reason: string | null = null;

  if (pageCount && pageCount >= MIN_PAGES_FOR_WARNING) {
    if (charsPerPage !== null && charsPerPage < MIN_CHARS_PER_PAGE) {
      reason = `PDF com ${pageCount} páginas, mas só ${trimmedLength.toLocaleString('pt-BR')} caracteres (~${charsPerPage}/página)`;
    } else {
      reason = `PDF com ${pageCount} páginas, mas só ${trimmedLength.toLocaleString('pt-BR')} caracteres extraídos`;
    }
  } else if (buffer.length >= MIN_FILE_BYTES_FOR_WARNING) {
    reason = `arquivo de ${fileSizeKb.toLocaleString('pt-BR')} KB, mas só ${trimmedLength.toLocaleString('pt-BR')} caracteres extraídos`;
  }

  if (!reason) {
    return { suspicious: false };
  }

  return {
    suspicious: true,
    message: `Extração suspeita: ${reason}. O PDF pode ser escaneado (imagem sem texto selecionável).`,
  };
}
