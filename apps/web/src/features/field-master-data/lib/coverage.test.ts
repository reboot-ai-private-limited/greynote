import { describe, expect, it } from 'vitest';
import { hqsReached, toStored, toTicks, zoneSummary, type Hierarchy } from './coverage';

// z1 has h1 (routes r1, r2) and h2 (r3); z2 has h3 (r4).
const h: Hierarchy = {
  hqs: [
    { id: 'h1', zoneId: 'z1' },
    { id: 'h2', zoneId: 'z1' },
    { id: 'h3', zoneId: 'z2' },
  ],
  routes: [
    { id: 'r1', hqId: 'h1' },
    { id: 'r2', hqId: 'h1' },
    { id: 'r3', hqId: 'h2' },
    { id: 'r4', hqId: 'h3' },
  ],
};
const none = { zoneIds: [], hqIds: [], routeIds: [] };

describe('toStored', () => {
  it('a zone with no HQ ticked is stored whole, and an HQ with no route ticked is stored whole', () => {
    expect(toStored({ ...none, zoneIds: ['z1', 'z2'] }, h)).toEqual({ zoneIds: ['z1', 'z2'], hqIds: [], routeIds: [] });
    expect(toStored({ zoneIds: ['z1'], hqIds: ['h1'], routeIds: [] }, h)).toEqual({ zoneIds: [], hqIds: ['h1'], routeIds: [] });
  });
  it('ticking some HQs narrows the zone, and ticking routes narrows the HQ', () => {
    expect(toStored({ zoneIds: ['z1'], hqIds: ['h1', 'h2'], routeIds: ['r1'] }, h)).toEqual({ zoneIds: [], hqIds: ['h2'], routeIds: ['r1'] });
  });
  it('drops HQs and routes whose zone or HQ is not ticked', () => {
    expect(toStored({ zoneIds: ['z2'], hqIds: ['h1'], routeIds: ['r1'] }, h)).toEqual({ zoneIds: ['z2'], hqIds: [], routeIds: [] });
  });
});

describe('toTicks', () => {
  it('ticks the zone and HQ above every stored HQ and route', () => {
    expect(toTicks({ zoneIds: [], hqIds: ['h2'], routeIds: ['r1'] }, h)).toEqual({ zoneIds: ['z1'], hqIds: ['h2', 'h1'], routeIds: ['r1'] });
    expect(toTicks({ ...none, zoneIds: ['z2'] }, h)).toEqual({ zoneIds: ['z2'], hqIds: [], routeIds: [] });
  });
  it('round-trips what is stored', () => {
    for (const stored of [
      { ...none, zoneIds: ['z1', 'z2'] },
      { zoneIds: ['z2'], hqIds: ['h1'], routeIds: [] },
      { zoneIds: [], hqIds: ['h2'], routeIds: ['r1', 'r2'] },
    ]) {
      expect(toStored(toTicks(stored, h), h)).toEqual(stored);
    }
  });
});

describe('hqsReached', () => {
  it('lists the HQs of a whole zone, the HQs named, and the HQs of routes', () => {
    expect(hqsReached({ zoneIds: ['z2'], hqIds: ['h2'], routeIds: ['r1'] }, h).sort()).toEqual(['h1', 'h2', 'h3']);
    expect(hqsReached(none, h)).toEqual([]);
  });
});

describe('zoneSummary', () => {
  it('says all of it when no HQ is ticked, and counts HQs and routes once narrowed', () => {
    expect(zoneSummary({ ...none, zoneIds: ['z1'] }, 'z1', h)).toBe('All HQs and routes');
    expect(zoneSummary({ zoneIds: ['z1'], hqIds: ['h1'], routeIds: [] }, 'z1', h)).toBe('1 of 2 HQs, all routes');
    expect(zoneSummary({ zoneIds: ['z1'], hqIds: ['h1', 'h2'], routeIds: ['r1'] }, 'z1', h)).toBe('2 of 2 HQs, 1 route');
    expect(zoneSummary({ zoneIds: ['z1', 'z2'], hqIds: ['h3'], routeIds: [] }, 'z2', h)).toBe('1 of 1 HQ, all routes');
  });
});
