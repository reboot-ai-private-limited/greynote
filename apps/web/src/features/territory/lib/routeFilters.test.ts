import type { HqDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { hqFilterOptions, pickHq, pickZone } from './routeFilters';

const hq = (id: string, zoneId: string, name: string, status: HqDto['status'] = 'active') => ({ id, zoneId, name, status }) as HqDto;
const hqs = [hq('slg', 'wb', 'SILIGURI'), hq('kol', 'wb', 'KOLKATA'), hq('old', 'wb', 'ASANSOL', 'inactive'), hq('guw', 'as', 'GUWAHATI')];

describe('All routes: Zone → HQ filters', () => {
  it('lists only the chosen zone’s HQs, active first', () => {
    expect(hqFilterOptions(hqs, 'wb').map((o) => o.label)).toEqual(['KOLKATA', 'SILIGURI', 'ASANSOL (inactive)']);
    expect(hqFilterOptions(hqs, '')).toHaveLength(4);
  });
  it('a new zone clears an HQ from another zone, and keeps one inside it', () => {
    expect(pickZone(hqs, { hqId: 'slg' }, 'as')).toEqual({ zoneId: 'as', hqId: '' });
    expect(pickZone(hqs, { hqId: 'slg' }, 'wb')).toEqual({ zoneId: 'wb', hqId: 'slg' });
    expect(pickZone(hqs, { hqId: 'slg' }, '')).toEqual({ zoneId: '', hqId: 'slg' });
  });
  it('choosing an HQ sets its zone', () => {
    expect(pickHq(hqs, { zoneId: '' }, 'guw')).toEqual({ zoneId: 'as', hqId: 'guw' });
    expect(pickHq(hqs, { zoneId: 'as' }, '')).toEqual({ zoneId: 'as', hqId: '' });
  });
});
