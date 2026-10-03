import type { HqDto, RouteDto, ZoneDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildTerritoryDirectory } from './directory';

const zones = [{ id: 'z1', name: 'West Bengal', status: 'active' }] as ZoneDto[];
const hqs = [
  { id: 'h1', zoneId: 'z1', name: 'SLG-1', status: 'active' },
  { id: 'h2', zoneId: 'z1', name: 'SLG-2', status: 'active' },
] as HqDto[];
const route = (id: string, hqId: string, name: string, status: 'active' | 'inactive' = 'active') =>
  ({ id, hqId, name, status }) as RouteDto;
const routes = [route('r2', 'h2', 'Naxalbari'), route('r1', 'h1', 'Naxalbari'), route('r3', 'h1', 'Old route', 'inactive')];

describe('buildTerritoryDirectory', () => {
  const directory = buildTerritoryDirectory({ zones, hqs, routes });

  it('labels a Route with its HQ, so two "Naxalbari" routes are told apart', () => {
    expect(directory.routeLabel('r1')).toBe('SLG-1 · Naxalbari');
    expect(directory.routeLabel('r2')).toBe('SLG-2 · Naxalbari');
  });
  it('still labels an inactive Route, since a record can point at one', () => {
    expect(directory.routeLabel('r3')).toBe('SLG-1 · Old route');
  });
  it('shows a dash for an id it does not know', () => {
    expect(directory.routeLabel('missing')).toBe('—');
  });
  it('offers only active Routes, sorted by label', () => {
    expect(directory.routeOptions.map((o) => o.value)).toEqual(['r1', 'r2']);
    expect(directory.routeOptions.map((o) => o.label)).toEqual(['SLG-1 · Naxalbari', 'SLG-2 · Naxalbari']);
  });
  it("reports a Route's Zone and HQ ids", () => {
    expect(directory.pathOf('r1')).toEqual({ zoneId: 'z1', hqId: 'h1' });
    expect(directory.pathOf('missing')).toBeNull();
  });
  it('falls back to what it has when the HQ is not loaded', () => {
    const partial = buildTerritoryDirectory({ zones, hqs: [], routes });
    expect(partial.routeLabel('r1')).toBe('Naxalbari');
    expect(partial.pathOf('r1')).toBeNull();
  });

  it('names a Zone and an HQ, with a dash for an unknown id', () => {
    expect(directory.zoneName('z1')).toBe('West Bengal');
    expect(directory.hqName('h1')).toBe('SLG-1');
    expect(directory.hqName('nope')).toBe('—');
    expect(directory.routeName('r1')).toBe('Naxalbari');
    expect(directory.routeName('nope')).toBe('—');
  });
  it('offers active Zones and HQs for a filter, an HQ with its Zone', () => {
    expect(directory.zoneOptions).toEqual([{ value: 'z1', label: 'West Bengal' }]);
    expect(directory.hqOptions).toEqual([
      { value: 'h1', label: 'West Bengal · SLG-1' },
      { value: 'h2', label: 'West Bengal · SLG-2' },
    ]);
  });
});
