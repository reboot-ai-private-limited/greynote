import { describe, expect, it } from 'vitest';
import { afterHqsChange, afterZonesChange, territoryErrors, territoryRule } from './territoryRules';

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
const sel = (over: Partial<{ zoneIds: string[]; hqIds: string[]; routeIds: string[] }> = {}) => ({ zoneIds: [], hqIds: [], routeIds: [], ...over });

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
    const next = afterHqsChange({ ...before, hqIds: ['b'] }, ['a', 'b'], routes, territoryRule('MR'));
    expect(next.routeIds).toEqual(['r3']);
  });

  it('a ZSM or NSM holds no routes', () => {
    expect(afterHqsChange(sel({ hqIds: ['a'], routeIds: ['r1'] }), [], routes, territoryRule('ZSM')).routeIds).toEqual([]);
  });

  it('unticking a Zone drops its HQs and their routes', () => {
    const start = sel({ zoneIds: ['z1', 'z2'], hqIds: ['a', 'c'], routeIds: ['r1', 'r4'] });
    const next = afterZonesChange(territoryRule('ZSM'), { ...start, zoneIds: ['z2'] }, hqs, routes);
    expect(next.hqIds).toEqual(['c']);
  });
});
