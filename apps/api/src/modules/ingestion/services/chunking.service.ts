import { Injectable } from '@nestjs/common';

export interface ChunkSegment {
  chapter: string;
  section?: string;
  markdownContent: string;
  normItem?: string;
}

const MAX_CHUNK_CHARS = 2000;

@Injectable()
export class ChunkingService {
  splitMarkdown(markdown: string, documentTitle: string): ChunkSegment[] {
    const sections = this.splitByHeadings(markdown);
    const segments: ChunkSegment[] = [];

    for (const section of sections) {
      if (section.content.length <= MAX_CHUNK_CHARS) {
        segments.push({
          chapter: section.heading || documentTitle,
          section: section.heading,
          markdownContent: section.content,
          normItem: this.extractNormItem(section.content),
        });
        continue;
      }

      const paragraphs = section.content.split(/\n{2,}/).filter(Boolean);
      let buffer = section.heading ? `${section.heading}\n\n` : '';

      for (const paragraph of paragraphs) {
        if ((buffer + paragraph).length > MAX_CHUNK_CHARS && buffer.trim()) {
          segments.push({
            chapter: section.heading || documentTitle,
            section: section.heading,
            markdownContent: buffer.trim(),
            normItem: this.extractNormItem(buffer),
          });
          buffer = section.heading ? `${section.heading}\n\n` : '';
        }
        buffer += `${paragraph}\n\n`;
      }

      if (buffer.trim()) {
        segments.push({
          chapter: section.heading || documentTitle,
          section: section.heading,
          markdownContent: buffer.trim(),
          normItem: this.extractNormItem(buffer),
        });
      }
    }

    if (segments.length === 0 && markdown.trim()) {
      segments.push({
        chapter: documentTitle,
        markdownContent: markdown.trim(),
      });
    }

    return segments;
  }

  private splitByHeadings(markdown: string): Array<{ heading: string; content: string }> {
    const parts = markdown.split(/^##\s+(.+)$/m);
    if (parts.length === 1) {
      return [{ heading: '', content: markdown.trim() }];
    }

    const sections: Array<{ heading: string; content: string }> = [];
    const preamble = parts[0]?.trim();
    if (preamble) sections.push({ heading: '', content: preamble });

    for (let i = 1; i < parts.length; i += 2) {
      const heading = parts[i]?.trim() ?? '';
      const content = parts[i + 1]?.trim() ?? '';
      sections.push({ heading: heading ? `## ${heading}` : '', content: heading ? `## ${heading}\n\n${content}` : content });
    }

    return sections;
  }

  private extractNormItem(content: string): string | undefined {
    const match = content.match(/(?:item|Item|ITEM)\s+([\d.]+(?:\.\d+)*)/);
    return match?.[1];
  }
}
