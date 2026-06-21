import TurndownService from 'turndown';

let turndownService: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndownService) {
    turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    turndownService.remove(['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript']);
  }
  return turndownService;
}

export function htmlFragmentToMarkdown(html: string): string {
  const normalized = html.trim();
  if (!normalized) return '';
  return getTurndown().turndown(normalized).trim();
}
