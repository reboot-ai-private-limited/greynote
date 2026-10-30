import { describe, expect, it } from 'vitest';
import { diffRoutes, groupRoutes, setTicked, tickState } from './routeGroups';

const zones = [{ id: 'z2', name: 'West' }, { id: 'z1', name: 'East' }, { id: 'z3', name: 'Empty' }];
const hqs = [
  { id: 'h1', name: 'Siliguri', zoneId: 'z1' },
  { id: 'h2', name: 'Kolkata', zoneId: 'z1' },
  { id: 'h3', name: 'Pune', zoneId: 'z2' },
  { id: 'h4', name: 'Nowhere', zoneId: 'z3' },
];
const routes = [
  { id: 'r1', hqId: 'h1', name: 'B' },
  { id: 'r2', hqId: 'h1', name: 'A' },
  { id: 'r3', hqId: 'h3', name: 'C' },
  { id: 'r4', hqId: 'gone', name: 'D' },
];

describe('groupRoutes', () => {
  it('nests Zone > HQ > Route by name and drops what has nothing to show', () => {
    const g = groupRoutes(routes, hqs, zones);
    expect(g.map((z) => z.name)).toEqual(['East', 'West']);
    expect(g[0]!.hqs.map((h) => h.name)).toEqual(['Siliguri']);
    expect(g[0]!.hqs[0]!.routes.map((r) => r.id)).toEqual(['r2', 'r1']);
  });
});

describe('ticks', () => {
  it('reports all, some or none', () => {
    expect(tickState(['a', 'b'], ['a', 'b', 'c'])).toBe('all');
    expect(tickState(['a', 'b'], ['a'])).toBe('some');
    expect(tickState(['a', 'b'], ['c'])).toBe('none');
  });

  it('ticks and unticks a group without touching the rest', () => {
    expect(setTicked(['x'], ['a', 'b'], true)).toEqual(['x', 'a', 'b']);
    expect(setTicked(['x', 'a', 'b'], ['a', 'b'], false)).toEqual(['x']);
  });
});

describe('diffRoutes', () => {
  it('splits a save into adds and removals', () => {
    expect(diffRoutes(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
  });
});
