export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export function buildCitationLabel(
  normReference?: string,
  normItem?: string,
  pageStart?: number,
  tableCaption?: string,
): string {
  const parts: string[] = [];

  if (normReference && normItem) parts.push(`${normReference}, item ${normItem}`);
  else if (normReference) parts.push(normReference);
  else parts.push('Fonte interna');

  if (tableCaption) parts.push(tableCaption);
  if (pageStart) parts.push(`p. ${pageStart}`);

  return parts.join(', ');
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function stripMarkdownToPlain(text: string): string {
  return text.replace(/[#*`]/g, ' ').replace(/\s+/g, ' ').trim();
}
