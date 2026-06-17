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

export function buildCitationLabel(normReference?: string, normItem?: string): string {
  if (normReference && normItem) return `${normReference}, item ${normItem}`;
  if (normReference) return normReference;
  return 'Fonte interna';
}
