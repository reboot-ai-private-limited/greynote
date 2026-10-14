import { describe, expect, it } from 'vitest';
import { complianceWarnings } from './complianceWarnings.js';

const row = (userId: string, rupees: number, esiNumber: string | null, epfNumber: string | null) => ({ userId, baseSalaryPaise: rupees * 100, esiNumber, epfNumber });

describe('complianceWarnings', () => {
  const ceiling = 21_000 * 100;

  it('warns about ESI only for someone at or under the ceiling who has no number', () => {
    const w = complianceWarnings([row('under', 20_999, null, 'E'), row('at', 21_000, null, 'E'), row('over', 21_001, null, 'E'), row('has', 15_000, '12345678901234567', 'E')], ceiling);
    expect(w.esiMissing).toEqual(['under', 'at']);
    expect(w.epfMissing).toEqual([]);
  });

  it('warns about EPF for everyone without one, whatever they earn', () => {
    const w = complianceWarnings([row('a', 50_000, null, null), row('b', 10_000, '12345678901234567', null), row('c', 10_000, '12345678901234567', 'X')], ceiling);
    expect(w.epfMissing).toEqual(['a', 'b']);
    expect(w.esiMissing).toEqual([]);
  });

  it('lists someone missing both in both', () => {
    const w = complianceWarnings([row('a', 10_000, null, null)], ceiling);
    expect(w).toEqual({ esiMissing: ['a'], epfMissing: ['a'] });
  });

  it('follows the ceiling it is given', () => {
    expect(complianceWarnings([row('a', 25_000, null, 'E')], 30_000 * 100).esiMissing).toEqual(['a']);
  });
});
