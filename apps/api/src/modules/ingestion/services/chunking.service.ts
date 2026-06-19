import { Injectable } from '@nestjs/common';

export interface ChunkSegment {
  chapter: string;
  section?: string;
  markdownContent: string;
  normItem?: string;
}

const MAX_CHUNK_CHARS = 2500;

@Injectable()
export class ChunkingService {
  splitMarkdown(markdown: string, documentTitle: string): ChunkSegment[] {
    const sections = this.splitByHeadings(markdown);
    const segments: ChunkSegment[] = [];

    for (const section of sections) {
      if (section.content.length <= MAX_CHUNK_CHARS) {
        segments.push(this.buildSegment(section, section.content, documentTitle));
        continue;
      }

      const headingPrefix = section.heading ? `${section.heading}\n\n` : '';
      // section.content já começa com o heading — remove para não duplicá-lo.
      const body = section.heading
        ? section.content.slice(section.heading.length).trimStart()
        : section.content;
      const blocks = body.split(/\n{2,}/).filter(Boolean);
      let buffer = headingPrefix;

      const flush = () => {
        const content = buffer.trim();
        // Nunca emite um chunk que é só o cabeçalho da seção (sem conteúdo útil).
        if (content && content !== section.heading) {
          segments.push(this.buildSegment(section, content, documentTitle));
        }
        buffer = headingPrefix;
      };

      for (const block of blocks) {
        const isTable = this.isTableBlock(block);

        // Tabela é atômica: se não cabe no buffer atual, fecha o anterior e
        // mantém a tabela inteira (com o cabeçalho da seção) no próprio chunk.
        if (isTable) {
          if (buffer.trim() && buffer.trim() !== section.heading) {
            flush();
          }
          segments.push(
            this.buildSegment(section, `${headingPrefix}${block}`.trim(), documentTitle),
          );
          buffer = headingPrefix;
          continue;
        }

        if ((buffer + block).length > MAX_CHUNK_CHARS && buffer.trim() !== section.heading) {
          flush();
        }
        buffer += `${block}\n\n`;
      }

      flush();
    }

    if (segments.length === 0 && markdown.trim()) {
      segments.push({
        chapter: documentTitle,
        markdownContent: markdown.trim(),
      });
    }

    return segments;
  }

  private buildSegment(
    section: { heading: string },
    content: string,
    documentTitle: string,
  ): ChunkSegment {
    return {
      chapter: section.heading || documentTitle,
      section: section.heading || undefined,
      markdownContent: content,
      normItem: this.extractNormItem(content),
    };
  }

  /** Bloco é tabela markdown se a maioria das linhas usa pipes (`|`). */
  private isTableBlock(block: string): boolean {
    const lines = block.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return false;
    const pipeLines = lines.filter((line) => line.trim().startsWith('|') || line.includes(' | '));
    return pipeLines.length >= Math.max(2, Math.ceil(lines.length * 0.6));
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
