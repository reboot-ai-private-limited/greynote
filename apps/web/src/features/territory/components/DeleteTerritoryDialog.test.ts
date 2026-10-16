import { describe, expect, it } from 'vitest';
import { impactLines } from './DeleteTerritoryDialog';

const base = {
  kind: 'ZONE' as const,
  id: 'z',
  name: 'ASSAM',
  alsoDeleted: { zones: 0, hqs: 6, routes: 31 },
  alsoDeletedNames: [],
  people: { total: 7, routes: 4, hq: 1, coverage: 2 },
  references: { doctors: 38, chemists: 12, distributors: 0, holidays: 2, plannedDays: 1 },
};

describe('impactLines', () => {
  it('says what is also deleted, who is affected and what stays', () => {
    const lines = impactLines(base);
    expect(lines.takes).toEqual(['6 HQs', '31 routes']);
    expect(lines.touches[0]).toBe('4 employees lose a route (their assignment ends)');
    expect(lines.touches).toHaveLength(3);
    expect(lines.stays).toEqual([
      '38 doctors will need a new route',
      '12 chemists will need a new route',
      '2 holidays point at it',
      '1 planned day from today uses these routes',
    ]);
  });

  it('leaves out what is zero and says nothing for a route nobody uses', () => {
    const none = impactLines({ ...base, alsoDeleted: { zones: 0, hqs: 0, routes: 0 }, people: { total: 0, routes: 0, hq: 0, coverage: 0 }, references: { doctors: 0, chemists: 0, distributors: 0, holidays: 0, plannedDays: 0 } });
    expect(none).toEqual({ takes: [], touches: [], stays: [] });
  });
});
