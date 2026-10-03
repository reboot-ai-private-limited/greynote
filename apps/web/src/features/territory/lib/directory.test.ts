import type { AreaDto, HqDto, RouteDto, ZoneDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildTerritoryDirectory } from './directory';

const zones = [{ id: 'z1', name: 'West Bengal', status: 'active' }] as ZoneDto[];
const hqs = [{ id: 'h1', zoneId: 'z1', name: 'Siliguri', status: 'active' }] as HqDto[];
const areas = [
  { id: 'a1', hqId: 'h1', name: 'Matigara', type: 'HQ', status: 'active' },
  { id: 'a2', hqId: 'h1', name: 'Fulbari', type: 'EX_STATION', status: 'active' },
] as AreaDto[];
const route = (id: string, areaId: string, name: string, status: 'active' | 'inactive' = 'active') =>
  ({ id, areaId, name, status }) as RouteDto;
const routes = [route('r2', 'a2', 'Route 1'), route('r1', 'a1', 'Route 1'), route('r3', 'a1', 'Old route', 'inactive')];

describe('buildTerritoryDirectory', () => {
  const directory = buildTerritoryDirectory({ zones, hqs, areas, routes });

  it('labels a Route with its HQ and Area, so two "Route 1" are told apart', () => {
    expect(directory.routeLabel('r1')).toBe('Siliguri · Matigara · Route 1');
    expect(directory.routeLabel('r2')).toBe('Siliguri · Fulbari · Route 1');
  });
  it('still labels an inactive Route, since a record can point at one', () => {
    expect(directory.routeLabel('r3')).toBe('Siliguri · Matigara · Old route');
  });
  it('shows a dash for an id it does not know', () => {
    expect(directory.routeLabel('missing')).toBe('—');
  });
  it('offers only active Routes, sorted by label', () => {
    expect(directory.routeOptions.map((o) => o.value)).toEqual(['r2', 'r1']);
    expect(directory.routeOptions.map((o) => o.label)).toEqual(['Siliguri · Fulbari · Route 1', 'Siliguri · Matigara · Route 1']);
  });
  it('reports a Route\'s Zone, HQ and Area ids', () => {
    expect(directory.pathOf('r1')).toEqual({ zoneId: 'z1', hqId: 'h1', areaId: 'a1' });
    expect(directory.pathOf('missing')).toBeNull();
  });
  it('falls back to what it has when the Area is not loaded', () => {
    const partial = buildTerritoryDirectory({ zones, hqs, areas: [], routes });
    expect(partial.routeLabel('r1')).toBe('Route 1');
    expect(partial.pathOf('r1')).toBeNull();
  });
});
