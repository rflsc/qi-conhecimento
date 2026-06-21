const mockReadabilityParse = jest.fn();

jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation(() => ({
    parse: mockReadabilityParse,
  })),
}));

jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation(() => ({
    window: { document: {} },
  })),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { DocumentSourceType } from '@qi-conhecimento/shared-types';
import { GenericHtmlExtractor } from './generic-html.extractor';
import { extractBlocksFromHtml } from './html-to-blocks.util';
import { assessParseQuality } from '../../utils/parse-quality.util';

const fixturePath = join(__dirname, '__fixtures__', 'zendesk-article.html');
const fixtureHtml = readFileSync(fixturePath, 'utf-8');

describe('GenericHtmlExtractor', () => {
  const extractor = new GenericHtmlExtractor();

  beforeEach(() => {
    mockReadabilityParse.mockReset();
  });

  it('usa Readability quando há conteúdo principal', async () => {
    mockReadabilityParse.mockReturnValue({
      title: 'Como criar uma edificação no AltoQi Eberick?',
      content: `
        <h1>Como criar uma edificação no AltoQi Eberick?</h1>
        <p>Para elaborar uma edificação no AltoQi Eberick, o usuário deve conhecer as ferramentas.</p>
        <h2>Nova edificação</h2>
        <ul><li>Criar edificação vazia</li></ul>
      `,
    });

    const result = await extractor.extract(fixtureHtml, {
      url: 'https://suporte.altoqi.com.br/hc/pt-br/articles/example',
    });

    expect(result.engine).toBe('html-readability');
    expect(result.title).toContain('edificação');
    expect(result.markdown).toContain('Nova edificação');
    expect(result.blocks?.some((block) => block.type === 'list')).toBe(true);
  });

  it('cai no fallback heurístico quando Readability não encontra artigo', async () => {
    mockReadabilityParse.mockReturnValue(null);

    const result = await extractor.extract(fixtureHtml, {
      url: 'https://suporte.altoqi.com.br/hc/pt-br/articles/example',
    });

    expect(result.engine).toBe('html-heuristic');
    expect(result.markdown).toContain('edificação');
    expect(result.blocks?.length).toBeGreaterThan(0);
  });
});

describe('extractBlocksFromHtml', () => {
  it('preserva headingPath hierárquico', () => {
    const blocks = extractBlocksFromHtml(`
      <h1>Capítulo</h1>
      <h2>Seção</h2>
      <p>Parágrafo da seção.</p>
    `);

    const heading = blocks.find((block) => block.type === 'heading' && block.level === 2);
    expect(heading?.headingPath).toEqual(['Capítulo', 'Seção']);

    const paragraph = blocks.find((block) => block.type === 'paragraph');
    expect(paragraph?.headingPath).toEqual(['Capítulo', 'Seção']);
  });
});

describe('assessParseQuality (HTML)', () => {
  it('marca extração curta como suspeita', () => {
    const assessment = assessParseQuality({
      sourceType: DocumentSourceType.LINK,
      rawInput: fixtureHtml,
      extractedChars: 50,
    });

    expect(assessment.suspicious).toBe(true);
    expect(assessment.message).toMatch(/HTML/i);
  });

  it('aceita extração saudável', () => {
    const assessment = assessParseQuality({
      sourceType: DocumentSourceType.LINK,
      rawInput: fixtureHtml,
      extractedChars: 1200,
    });

    expect(assessment.suspicious).toBe(false);
  });
});
