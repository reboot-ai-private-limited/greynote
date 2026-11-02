import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search';

describe('matchesSearch', () => {
  it('matches everything on an empty query', () => expect(matchesSearch('Siliguri HQ', '  ')).toBe(true));
  it('ignores case', () => expect(matchesSearch('Siliguri HQ', 'SILI')).toBe(true));
  it('needs every word, in any order', () => {
    expect(matchesSearch('Asha Rao EMP-014', 'rao emp-014')).toBe(true);
    expect(matchesSearch('Asha Rao EMP-014', 'rao kumar')).toBe(false);
  });
});
