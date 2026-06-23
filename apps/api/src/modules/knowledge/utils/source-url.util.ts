import { KnowledgeChunkDocument } from '../schemas/knowledge-chunk.schema';
import { KnowledgeDocumentEntity } from '../schemas/knowledge-document.schema';

export function isHttpUrl(value?: string | null): value is string {
  if (!value?.trim()) return false;
  return /^https?:\/\//i.test(value.trim());
}

/** URL da página/fonte — prefer chunk.sourceUrl (web-import) sobre document.sourceReference (seed). */
export function resolveChunkSourceUrl(
  chunk: Pick<KnowledgeChunkDocument, 'sourceUrl'>,
  document: Pick<KnowledgeDocumentEntity, 'sourceReference'>,
): string | undefined {
  if (isHttpUrl(chunk.sourceUrl)) return chunk.sourceUrl.trim();
  if (isHttpUrl(document.sourceReference)) return document.sourceReference.trim();
  return undefined;
}

export interface CitationLinkSource {
  sourceUrl?: string;
  documentTitle?: string;
}

/** Anexa links https:// ausentes no answer (Telegram exige URL plana, não markdown). */
export function enrichAnswerWithSourceLinks(
  answer: string,
  citations: CitationLinkSource[],
): string {
  const urls = dedupeHttpUrls(
    citations
      .map((c) => c.sourceUrl?.trim())
      .filter((url): url is string => isHttpUrl(url)),
  );

  if (urls.length === 0) return answer;

  const missing = urls.filter((url) => !answer.includes(url));
  if (missing.length === 0) return answer;

  const lines = missing.map((url) => {
    const title = citations.find((c) => c.sourceUrl?.trim() === url)?.documentTitle;
    return title ? `• ${title}\n${url}` : `• ${url}`;
  });

  return `${answer.trim()}\n\n📎 Manual / fonte:\n${lines.join('\n')}`;
}

export function buildPdfAttachmentsFromCitations(
  citations: CitationLinkSource[],
): Array<{ type: 'document'; url: string; filename?: string }> {
  const seen = new Set<string>();
  const attachments: Array<{ type: 'document'; url: string; filename?: string }> = [];

  for (const citation of citations) {
    const url = citation.sourceUrl?.trim();
    if (!url || !/\.pdf(?:\?|$)/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    attachments.push({
      type: 'document',
      url,
      filename: citation.documentTitle,
    });
  }

  return attachments;
}

function dedupeHttpUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}
