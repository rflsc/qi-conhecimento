import { inferChunkTagsFromDocument } from './document-tags.util';

describe('inferChunkTagsFromDocument', () => {
  it('combines normReference and extra tags', () => {
    expect(
      inferChunkTagsFromDocument({
        normReference: 'NBR 6118',
        extraTags: ['concreto', 'estruturas'],
      }),
    ).toEqual(['nbr 6118', 'concreto', 'estruturas']);
  });

  it('returns only extra tags when normReference is empty', () => {
    expect(inferChunkTagsFromDocument({ extraTags: ['manual-x'] })).toEqual(['manual-x']);
  });
});
