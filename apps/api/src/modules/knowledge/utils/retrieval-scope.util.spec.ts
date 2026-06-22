import { EngineeringSpecialty } from '@qi-conhecimento/shared-types';
import {
  chunkMatchesScopeTags,
  isRetrievalScopeRestricted,
  mergeRetrievalScope,
  normalizeRetrievalTags,
} from './retrieval-scope.util';

describe('normalizeRetrievalTags', () => {
  it('deduplicates and lowercases', () => {
    expect(normalizeRetrievalTags(['Eberick', 'eberick', ' NBR 6118 '])).toEqual([
      'eberick',
      'nbr 6118',
    ]);
  });
});

describe('chunkMatchesScopeTags', () => {
  it('matches when chunk has any scope tag', () => {
    expect(chunkMatchesScopeTags(['manual-x', 'v2'], ['manual-x'])).toBe(true);
    expect(chunkMatchesScopeTags(['nbr 8800'], ['manual-x'])).toBe(false);
  });
});

describe('isRetrievalScopeRestricted', () => {
  it('is true when tags or documentIds are set', () => {
    expect(isRetrievalScopeRestricted({ tags: ['x'] })).toBe(true);
    expect(isRetrievalScopeRestricted({ documentIds: ['abc'] })).toBe(true);
    expect(isRetrievalScopeRestricted({ specialty: EngineeringSpecialty.CIVIL })).toBe(false);
  });
});

describe('mergeRetrievalScope', () => {
  it('merges explicit specialty and tagFilter only', () => {
    expect(
      mergeRetrievalScope(EngineeringSpecialty.CIVIL, {
        tags: ['manual-x'],
      }),
    ).toEqual({
      specialty: EngineeringSpecialty.CIVIL,
      tags: ['manual-x'],
      documentIds: undefined,
    });
  });

  it('does not infer tags from query text', () => {
    expect(mergeRetrievalScope(EngineeringSpecialty.CIVIL, undefined)).toEqual({
      specialty: EngineeringSpecialty.CIVIL,
      tags: undefined,
      documentIds: undefined,
    });
  });
});
