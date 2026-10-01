import { describe, expect, it } from 'vitest';
import { breadcrumb, searchRows } from './tree';

describe('breadcrumb', () => {
  it('joins with a chevron and shows a missing parent as a dash', () => {
    expect(breadcrumb(['West Bengal', 'Siliguri'])).toBe('West Bengal › Siliguri');
    expect(breadcrumb([undefined, 'Siliguri'])).toBe('— › Siliguri');
  });
});

describe('searchRows', () => {
  const lookups = {
    zoneName: (id: string) => ({ z1: 'West Bengal' })[id],
    hqName: (id: string) => ({ h1: 'Siliguri' })[id],
    hqZoneId: (id: string) => ({ h1: 'z1' })[id],
  };

  it('lists zones, HQs, then areas, each with its ancestry', () => {
    const rows = searchRows(
      {
        zones: [{ id: 'z1', name: 'West Bengal', status: 'active' }],
        hqs: [{ id: 'h1', zoneId: 'z1', name: 'Siliguri', status: 'active' }],
        areas: [{ id: 'a1', hqId: 'h1', name: 'Matigara', type: 'HQ', status: 'inactive' }],
      },
      lookups,
    );
    expect(rows.map((r) => [r.kind, r.path])).toEqual([
      ['zone', ''],
      ['hq', 'West Bengal'],
      ['area', 'West Bengal › Siliguri'],
    ]);
  });

  it('shows a dash for an ancestor outside the loaded lookups', () => {
    const rows = searchRows(
      { zones: [], hqs: [{ id: 'h9', zoneId: 'zz', name: 'Far', status: 'active' }], areas: [] },
      lookups,
    );
    expect(rows[0]?.path).toBe('—');
  });
});
