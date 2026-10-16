import { describe, expect, it } from 'vitest';
import {
  afterHqsChange,
  afterZonesChange,
  territoryErrors,
  territoryRule,
  zonesWithoutHqs,
} from './territoryRules';

const hqs = [
  { id: 'a', zoneId: 'z1' },
  { id: 'b', zoneId: 'z1' },
  { id: 'c', zoneId: 'z2' },
];
const routes = [
  { id: 'r1', hqId: 'a' },
  { id: 'r2', hqId: 'a' },
  { id: 'r3', hqId: 'b' },
  { id: 'r4', hqId: 'c' },
];
const sel = (over: Partial<{ zoneIds: string[]; hqIds: string[]; routeIds: string[] }> = {}) => ({
  zoneIds: [],
  hqIds: [],
  routeIds: [],
  ...over,
});

describe('territory rules by designation', () => {
  it('MR needs HQs and routes (Zones are ticked to list the HQs, not required themselves); ASM and RSM need HQs; ZSM needs Zones; NSM needs nothing', () => {
    expect(Object.keys(territoryErrors(territoryRule('MR'), sel()))).toEqual(['hqIds', 'routeIds']);
    expect(Object.keys(territoryErrors(territoryRule('ASM'), sel()))).toEqual(['hqIds']);
    expect(Object.keys(territoryErrors(territoryRule('RSM'), sel({ hqIds: ['a'] })))).toEqual([]);
    expect(Object.keys(territoryErrors(territoryRule('ZSM'), sel()))).toEqual(['zoneIds']);
    expect(territoryErrors(territoryRule('NSM'), sel())).toEqual({});
    expect(territoryErrors(territoryRule(undefined), sel())).toEqual({});
  });
});

describe('ticking cascades', () => {
  it('ticking an HQ ticks all its routes by default, for a designation that holds routes', () => {
    const next = afterHqsChange(sel({ hqIds: ['a'] }), [], routes, territoryRule('ASM'));
    expect(next.routeIds).toEqual(['r1', 'r2']);
  });

  it('keeps the routes already ticked for an HQ that stays, and drops those of an HQ unticked', () => {
    const before = sel({ hqIds: ['a', 'b'], routeIds: ['r1', 'r3'] });
    const next = afterHqsChange(
      { ...before, hqIds: ['b'] },
      ['a', 'b'],
      routes,
      territoryRule('MR'),
    );
    expect(next.routeIds).toEqual(['r3']);
  });

  it('a ZSM or NSM holds no routes', () => {
    expect(
      afterHqsChange(sel({ hqIds: ['a'], routeIds: ['r1'] }), [], routes, territoryRule('ZSM'))
        .routeIds,
    ).toEqual([]);
  });

  it('unticking a Zone drops its HQs and their routes', () => {
    const start = sel({ zoneIds: ['z1', 'z2'], hqIds: ['a', 'c'], routeIds: ['r1', 'r4'] });
    const next = afterZonesChange(
      territoryRule('ZSM'),
      { ...start, zoneIds: ['z2'] },
      start,
      hqs,
      routes,
    );
    expect(next.hqIds).toEqual(['c']);
  });

  it('ticking a Zone ticks all its HQs and their routes for an ASM; a ZSM gets no HQs ticked', () => {
    const asm = afterZonesChange(
      territoryRule('ASM'),
      sel({ zoneIds: ['z1'] }),
      sel(),
      hqs,
      routes,
    );
    expect(asm.hqIds).toEqual(['a', 'b']);
    expect(asm.routeIds).toEqual(['r1', 'r2', 'r3']);
    expect(
      afterZonesChange(territoryRule('ZSM'), sel({ zoneIds: ['z1'] }), sel(), hqs, routes).hqIds,
    ).toEqual([]);
  });

  it('keeps the HQs already chosen in a Zone that stays ticked', () => {
    const start = sel({ zoneIds: ['z1'], hqIds: ['a'] });
    const next = afterZonesChange(
      territoryRule('MR'),
      { ...start, zoneIds: ['z1', 'z2'] },
      start,
      hqs,
      routes,
    );
    expect(next.hqIds).toEqual(['a', 'c']);
  });
});

describe('a ticked Zone with no HQ', () => {
  it('is caught for a designation that names HQs, and not for a ZSM', () => {
    const s = sel({ zoneIds: ['z1', 'z2'], hqIds: ['a'] });
    expect(zonesWithoutHqs(territoryRule('RSM'), s, hqs)).toEqual(['z2']);
    expect(territoryErrors(territoryRule('RSM'), s, hqs)['hqIds']).toMatch(
      /under every ticked zone/,
    );
    expect(zonesWithoutHqs(territoryRule('ZSM'), s, hqs)).toEqual([]);
  });
});
