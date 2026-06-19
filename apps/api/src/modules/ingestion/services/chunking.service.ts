import { Injectable } from '@nestjs/common';
import { ChunkContentType, ParseBlock } from '@qi-conhecimento/shared-types';
import { ChunkSegment } from '../parsers/parser.interface';

const MAX_CHUNK_CHARS = 2500;

@Injectable()
export class ChunkingService {
  splitFromBlocks(blocks: ParseBlock[], documentTitle: string): ChunkSegment[] {
    const contentBlocks = blocks.filter((block) => block.type !== 'heading');
    if (contentBlocks.length === 0) {
      return [];
    }

    const segments: ChunkSegment[] = [];
    let bufferBlocks: ParseBlock[] = [];
    let bufferMarkdown = '';

    const flushBuffer = () => {
      const segment = this.buildSegmentFromBlocks(bufferBlocks, bufferMarkdown, documentTitle);
      if (segment) segments.push(segment);
      bufferBlocks = [];
      bufferMarkdown = '';
    };

    for (const block of contentBlocks) {
      if (block.type === 'table') {
        flushBuffer();
        const tableSegment = this.buildTableSegment(block, documentTitle);
        if (tableSegment) segments.push(tableSegment);
        continue;
      }

      const piece = this.blockToMarkdown(block);
      if (!piece) continue;

      if (
        bufferMarkdown &&
        (bufferMarkdown.length + piece.length > MAX_CHUNK_CHARS || this.hasMixedTypes(bufferBlocks, block))
      ) {
        flushBuffer();
      }

      bufferBlocks.push(block);
      bufferMarkdown = bufferMarkdown ? `${bufferMarkdown}\n\n${piece}` : piece;
    }

    flushBuffer();
    return segments;
  }

  splitMarkdown(markdown: string, documentTitle: string): ChunkSegment[] {
    const sections = this.splitByHeadings(markdown);
    const segments: ChunkSegment[] = [];

    for (const section of sections) {
      if (section.content.length <= MAX_CHUNK_CHARS) {
        segments.push(this.buildSegment(section, section.content, documentTitle));
        continue;
      }

      const headingPrefix = section.heading ? `${section.heading}\n\n` : '';
      const body = section.heading
        ? section.content.slice(section.heading.length).trimStart()
        : section.content;
      const blocks = body.split(/\n{2,}/).filter(Boolean);
      let buffer = headingPrefix;

      const flush = () => {
        const content = buffer.trim();
        if (content && content !== section.heading) {
          segments.push(this.buildSegment(section, content, documentTitle));
        }
        buffer = headingPrefix;
      };

      for (const block of blocks) {
        const isTable = this.isTableBlock(block);

        if (isTable) {
          if (buffer.trim() && buffer.trim() !== section.heading) {
            flush();
          }
          segments.push(
            this.buildSegment(section, `${headingPrefix}${block}`.trim(), documentTitle, 'table'),
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
        contentType: 'paragraph',
      });
    }

    return segments;
  }

  private buildTableSegment(block: ParseBlock, documentTitle: string): ChunkSegment | null {
    const markdown = this.composeTableMarkdown(block);
    if (!markdown.trim()) return null;

    const headingPath = block.headingPath ?? [];
    const chapter = this.chapterFromPath(headingPath, documentTitle);

    return {
      chapter,
      section: chapter !== documentTitle ? chapter : undefined,
      markdownContent: markdown,
      normItem: this.extractNormItem(headingPath, markdown),
      pageStart: block.pageStart,
      pageEnd: block.pageEnd ?? block.pageStart,
      contentType: 'table',
      headingPath: headingPath.length ? headingPath : undefined,
      tableCaption: block.caption,
      tableSource: block.tableSource,
    };
  }

  private buildSegmentFromBlocks(
    blocks: ParseBlock[],
    markdown: string,
    documentTitle: string,
  ): ChunkSegment | null {
    const content = markdown.trim();
    if (!content) return null;

    const headingPath = blocks.find((b) => b.headingPath?.length)?.headingPath ?? [];
    const chapter = this.chapterFromPath(headingPath, documentTitle);
    const types = new Set(blocks.map((b) => b.type));

    return {
      chapter,
      section: chapter !== documentTitle ? chapter : undefined,
      markdownContent: content,
      normItem: this.extractNormItem(headingPath, content),
      pageStart: this.minPage(blocks, 'pageStart'),
      pageEnd: this.maxPage(blocks, 'pageEnd'),
      contentType: this.resolveContentType(types),
      headingPath: headingPath.length ? headingPath : undefined,
    };
  }

  private buildSegment(
    section: { heading: string },
    content: string,
    documentTitle: string,
    contentType: ChunkContentType = 'paragraph',
  ): ChunkSegment {
    return {
      chapter: section.heading || documentTitle,
      section: section.heading || undefined,
      markdownContent: content,
      normItem: this.extractNormItem([], content),
      contentType,
      tableCaption: contentType === 'table' ? this.extractTableCaption(content) : undefined,
    };
  }

  private blockToMarkdown(block: ParseBlock): string {
    if (block.type === 'table') {
      return this.composeTableMarkdown(block);
    }
    return (block.text ?? '').trim();
  }

  private composeTableMarkdown(block: ParseBlock): string {
    const body = (block.markdown ?? block.text ?? '').trim();
    if (!body) return '';
    if (block.caption && !body.toLowerCase().includes(block.caption.toLowerCase().slice(0, 12))) {
      return `${block.caption}\n\n${body}`;
    }
    return body;
  }

  private hasMixedTypes(bufferBlocks: ParseBlock[], next: ParseBlock): boolean {
    if (bufferBlocks.length === 0) return false;
    const currentType = bufferBlocks[0]?.type;
    return currentType !== next.type;
  }

  private resolveContentType(types: Set<string>): ChunkContentType {
    if (types.size === 0) return 'paragraph';
    if (types.size === 1) {
      const only = [...types][0];
      if (only === 'table') return 'table';
      if (only === 'list') return 'list';
      return 'paragraph';
    }
    return 'mixed';
  }

  private chapterFromPath(headingPath: string[], documentTitle: string): string {
    if (headingPath.length === 0) return documentTitle;
    return headingPath[headingPath.length - 1] ?? documentTitle;
  }

  private minPage(blocks: ParseBlock[], key: 'pageStart' | 'pageEnd'): number | undefined {
    const values = blocks.map((b) => b[key]).filter((v): v is number => typeof v === 'number');
    return values.length ? Math.min(...values) : undefined;
  }

  private maxPage(blocks: ParseBlock[], key: 'pageStart' | 'pageEnd'): number | undefined {
    const values = blocks.map((b) => b[key]).filter((v): v is number => typeof v === 'number');
    return values.length ? Math.max(...values) : undefined;
  }

  private extractNormItem(headingPath: string[], content: string): string | undefined {
    for (let i = headingPath.length - 1; i >= 0; i -= 1) {
      const fromHeading = headingPath[i]?.match(/^(\d+(?:\.\d+)+)/);
      if (fromHeading?.[1]) return fromHeading[1];
    }

    const fromContent = content.match(/(?:item|Item|ITEM)\s+([\d.]+(?:\.\d+)*)/);
    return fromContent?.[1];
  }

  private extractTableCaption(content: string): string | undefined {
    const match = content.match(/^Tabela\s+[A-Z]?\d*(?:\.\d+)?\s*[-–—].+$/im);
    return match?.[0]?.trim();
  }

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
      sections.push({
        heading: heading ? `## ${heading}` : '',
        content: heading ? `## ${heading}\n\n${content}` : content,
      });
    }

    return sections;
  }
}
