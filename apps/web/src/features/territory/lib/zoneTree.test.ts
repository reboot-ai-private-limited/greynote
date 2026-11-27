import type { HqDto, ZoneDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { zoneTree } from './zoneTree';

const zone = (id: string, name: string, status: ZoneDto['status'] = 'active') => ({ id, name, status }) as ZoneDto;
const hq = (id: string, zoneId: string, name: string, status: HqDto['status'] = 'active') => ({ id, zoneId, name, status }) as HqDto;

const zones = [zone('wb', 'WEST BENGAL'), zone('as', 'ASSAM'), zone('old', 'BIHAR', 'inactive')];
const hqs = [hq('slg', 'wb', 'SILIGURI'), hq('kol', 'wb', 'KOLKATA'), hq('guw', 'as', 'GUWAHATI'), hq('sil', 'as', 'SILCHAR', 'inactive')];
const names = (t: ReturnType<typeof zoneTree>) => t.map((g) => `${g.zone.name}: ${g.hqs.map((h) => h.name).join(',')}`);

describe('zoneTree', () => {
  it('lists active zones first, each with its HQs (active first, by name)', () => {
    expect(names(zoneTree(zones, hqs, ''))).toEqual(['ASSAM: GUWAHATI,SILCHAR', 'WEST BENGAL: KOLKATA,SILIGURI', 'BIHAR: ']);
  });
  it('a zone that matches the search shows all its HQs', () => {
    expect(names(zoneTree(zones, hqs, ' assam '))).toEqual(['ASSAM: GUWAHATI,SILCHAR']);
  });
  it('an HQ that matches shows under its zone; zones with no match drop out', () => {
    expect(names(zoneTree(zones, hqs, 'sil'))).toEqual(['ASSAM: SILCHAR', 'WEST BENGAL: SILIGURI']);
    expect(zoneTree(zones, hqs, 'nowhere')).toEqual([]);
  });
});
