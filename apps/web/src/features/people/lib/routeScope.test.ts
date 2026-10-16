import { describe, expect, it } from 'vitest';
import { routeScope } from './routeScope';

const zoneOfHq = new Map([['h1', 'z1'], ['h2', 'z1'], ['h3', 'z2']]);

describe('routeScope', () => {
  it('suits routes of the HQs covered, and flags the rest', () => {
    const s = routeScope({ coverage: { hqIds: ['h1', 'h3'], zoneIds: [] }, zoneOfHq });
    expect([s.inScope('h1'), s.inScope('h2'), s.inScope('h3')]).toEqual([true, false, true]);
  });

  it('a covered Zone brings every HQ of it', () => {
    const s = routeScope({ coverage: { hqIds: [], zoneIds: ['z1'] }, zoneOfHq });
    expect([s.inScope('h1'), s.inScope('h2'), s.inScope('h3')]).toEqual([true, true, false]);
  });

  it('naming some HQs of a covered Zone narrows it to those', () => {
    const s = routeScope({ coverage: { hqIds: ['h1'], zoneIds: ['z1'] }, zoneOfHq });
    expect([s.inScope('h1'), s.inScope('h2')]).toEqual([true, false]);
  });

  it('covering nothing is not limited', () => {
    expect(routeScope({ coverage: undefined, zoneOfHq }).unlimited).toBe(true);
    expect(routeScope({ coverage: { hqIds: [], zoneIds: [] }, zoneOfHq }).unlimited).toBe(true);
  });
});
