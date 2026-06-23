import {
  enrichAnswerWithSourceLinks,
  resolveChunkSourceUrl,
  buildPdfAttachmentsFromCitations,
} from './source-url.util';

describe('resolveChunkSourceUrl', () => {
  it('prefers chunk sourceUrl over document seed URL', () => {
    expect(
      resolveChunkSourceUrl(
        { sourceUrl: 'https://suporte.altoqi.com.br/hc/pt-br/articles/123' },
        { sourceReference: 'https://suporte.altoqi.com.br/hc/pt-br' },
      ),
    ).toBe('https://suporte.altoqi.com.br/hc/pt-br/articles/123');
  });

  it('falls back to document sourceReference when chunk has no URL', () => {
    expect(
      resolveChunkSourceUrl(
        {},
        { sourceReference: 'https://suporte.altoqi.com.br/hc/pt-br/articles/456' },
      ),
    ).toBe('https://suporte.altoqi.com.br/hc/pt-br/articles/456');
  });
});

describe('enrichAnswerWithSourceLinks', () => {
  it('appends missing manual links to answer', () => {
    const result = enrichAnswerWithSourceLinks('Passo a passo aqui.', [
      {
        documentTitle: 'Abrir projeto',
        sourceUrl: 'https://suporte.altoqi.com.br/hc/pt-br/articles/999',
      },
    ]);

    expect(result).toContain('Passo a passo aqui.');
    expect(result).toContain('https://suporte.altoqi.com.br/hc/pt-br/articles/999');
    expect(result).toContain('Abrir projeto');
  });

  it('does not duplicate URLs already in answer', () => {
    const url = 'https://suporte.altoqi.com.br/hc/pt-br/articles/999';
    const answer = `Veja ${url}`;
    expect(enrichAnswerWithSourceLinks(answer, [{ sourceUrl: url }])).toBe(answer);
  });
});

describe('buildPdfAttachmentsFromCitations', () => {
  it('returns document attachments only for PDF URLs', () => {
    expect(
      buildPdfAttachmentsFromCitations([
        { sourceUrl: 'https://cdn.example.com/manual.pdf', documentTitle: 'Manual' },
        { sourceUrl: 'https://help.example.com/page' },
      ]),
    ).toEqual([{ type: 'document', url: 'https://cdn.example.com/manual.pdf', filename: 'Manual' }]);
  });
});
