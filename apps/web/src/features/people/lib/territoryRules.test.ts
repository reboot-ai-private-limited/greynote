import { describe, expect, it } from 'vitest';
import { territoryErrors, territoryRule, zonesOfHqs } from './territoryRules';

describe('one HQ for every designation (2026-11-26)', () => {
  it('is the same rule for an MR and the NSM: one HQ, no routes to tick', () => {
    expect(territoryRule('MR')).toEqual(territoryRule('NSM'));
    expect(territoryRule('ZSM')).toMatchObject({ hqs: 'one', hqsRequired: true, routes: 'none' });
  });

  it('needs exactly one HQ', () => {
    const rule = territoryRule('ASM');
    expect(territoryErrors(rule, { hqIds: [] })).toHaveProperty('hqIds');
    expect(territoryErrors(rule, { hqIds: ['a', 'b'] })).toHaveProperty('hqIds');
    expect(territoryErrors(rule, { hqIds: ['a'] })).toEqual({});
  });

  it('an HQ brings its Zone', () => {
    expect(zonesOfHqs(['h1', 'h2'], [{ id: 'h1', zoneId: 'z1' }, { id: 'h2', zoneId: 'z1' }, { id: 'h3', zoneId: 'z2' }])).toEqual(['z1']);
  });
});
