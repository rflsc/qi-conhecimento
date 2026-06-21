import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { ParseBlock } from '@qi-conhecimento/shared-types';

const BLOCK_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'table',
  'ul',
  'ol',
  'pre',
  'blockquote',
]);

const CONTAINER_TAGS = new Set(['div', 'section', 'article', 'main', 'body']);

function normalizeFragment(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '<body></body>';
  if (/<body[\s>]/i.test(trimmed)) return trimmed;
  return `<body>${trimmed}</body>`;
}

function tableToMarkdown($: cheerio.CheerioAPI, table: Element): string {
  const rows: string[][] = [];

  $(table)
    .find('tr')
    .each((_, row) => {
      const cells: string[] = [];
      $(row)
        .find('th, td')
        .each((__, cell) => {
          const text = $(cell).text().trim().replace(/\|/g, '\\|').replace(/\s+/g, ' ');
          if (text) cells.push(text);
        });
      if (cells.length > 0) rows.push(cells);
    });

  if (rows.length === 0) return '';

  const [header, ...body] = rows;
  const separator = header.map(() => '---');
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function listToMarkdown($: cheerio.CheerioAPI, list: Element, ordered: boolean): string {
  const items: string[] = [];
  $(list)
    .children('li')
    .each((index, item) => {
      const text = $(item).text().trim().replace(/\s+/g, ' ');
      if (!text) return;
      items.push(ordered ? `${index + 1}. ${text}` : `- ${text}`);
    });
  return items.join('\n');
}

function updateHeadingPath(headingPath: string[], level: number, text: string): string[] {
  const next = headingPath.slice(0, level - 1);
  next[level - 1] = text;
  headingPath.splice(0, headingPath.length, ...next);
  return [...headingPath];
}

function emitBlock(
  $: cheerio.CheerioAPI,
  node: Element,
  tag: string,
  headingPath: string[],
  blocks: ParseBlock[],
): void {
  if (tag.startsWith('h') && tag.length === 2) {
    const level = Number(tag[1]);
    const text = $(node).text().trim().replace(/\s+/g, ' ');
    if (!text || Number.isNaN(level)) return;
    const path = updateHeadingPath(headingPath, level, text);
    blocks.push({ type: 'heading', text, level, headingPath: path });
    return;
  }

  if (tag === 'p' || tag === 'pre' || tag === 'blockquote') {
    const text = $(node).text().trim().replace(/\s+/g, ' ');
    if (!text) return;
    blocks.push({
      type: 'paragraph',
      text,
      headingPath: headingPath.length ? [...headingPath] : undefined,
    });
    return;
  }

  if (tag === 'table') {
    const markdown = tableToMarkdown($, node);
    if (!markdown) return;
    blocks.push({
      type: 'table',
      markdown,
      text: $(node).text().trim().replace(/\s+/g, ' '),
      headingPath: headingPath.length ? [...headingPath] : undefined,
      tableSource: 'text_recovery',
    });
    return;
  }

  if (tag === 'ul' || tag === 'ol') {
    const markdown = listToMarkdown($, node, tag === 'ol');
    if (!markdown) return;
    blocks.push({
      type: 'list',
      markdown,
      text: markdown,
      headingPath: headingPath.length ? [...headingPath] : undefined,
    });
  }
}

function walkNodes(
  $: cheerio.CheerioAPI,
  node: Element,
  headingPath: string[],
  blocks: ParseBlock[],
): void {
  const tag = node.tagName.toLowerCase();

  if (BLOCK_TAGS.has(tag)) {
    emitBlock($, node, tag, headingPath, blocks);
    return;
  }

  if (!CONTAINER_TAGS.has(tag)) return;

  const children = node.children.filter((child: AnyNode): child is Element => child.type === 'tag');
  for (const child of children) {
    walkNodes($, child, headingPath, blocks);
  }
}

export function extractBlocksFromHtml(html: string): ParseBlock[] {
  const $ = cheerio.load(normalizeFragment(html));
  const blocks: ParseBlock[] = [];
  const headingPath: string[] = [];
  const root = $('body').get(0);

  if (!root) return blocks;

  const children = root.children.filter((child: AnyNode): child is Element => child.type === 'tag');
  for (const child of children) {
    walkNodes($, child, headingPath, blocks);
  }

  return blocks;
}
