/** Tags de chunk derivadas dos metadados do documento na ingestão. */
export function inferChunkTagsFromDocument(meta: {
  normReference?: string;
  extraTags?: string[];
}): string[] {
  const tags = new Set<string>();
  const norm = meta.normReference?.trim().toLowerCase();
  if (norm) tags.add(norm);

  for (const tag of meta.extraTags ?? []) {
    const normalized = tag.trim().toLowerCase();
    if (normalized) tags.add(normalized);
  }

  return [...tags];
}
