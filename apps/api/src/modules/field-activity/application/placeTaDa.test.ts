import { describe, expect, it } from 'vitest';
import { calculatePlaceTaDa, placeDayKind, type DayPlace, type PayRates } from './taDaCalculator.js';

/** ₹3 a km; DA: HQ ₹0, Ex ₹200, Out ₹500. `TA_MAX_KM` 100. */
const rates: PayRates = { taPerKmRatePaise: 300, hqDaPaise: 0, exStationDaPaise: 20000, outStationDaPaise: 50000 };
const place = (id: string, hqId: string, type: DayPlace['type']): DayPlace => ({ id, hqId, type });
const route = (id: string, km: string | null, over: { taFixedPaise?: number | null; taPerKmRateOverridePaise?: number | null } = {}) => ({
  id,
  routeType: 'EX_STATION' as const,
  distanceKm: km,
  distanceStatus: km === null ? 'FAILED' : 'CALCULATED',
  taPerKmRateOverridePaise: over.taPerKmRateOverridePaise ?? null,
  taFixedPaise: over.taFixedPaise ?? null,
});
const rows = (r: ReturnType<typeof calculatePlaceTaDa>) => r.map((x) => `${x.type}:${x.amountPaise}${x.distanceFlag ? '!' : ''}`);

// Jalpaiguri HQ (J): its town, Mainaguri (Ex), Dhupguri (Out), Station Rd (HQ). Siliguri HQ (S): its town. Malbazar HQ (M): Chalsa.
const J = place('jal', 'J', 'HQ');
const mainaguri = place('main', 'J', 'EX_STATION');
const dhupguri = place('dhup', 'J', 'OUT_STATION');
const stationRd = place('stn', 'J', 'HQ');
const S = place('slg', 'S', 'HQ');
const chalsa = place('chalsa', 'M', 'EX_STATION');
const calc = (from: DayPlace, to: DayPlace, ownHqId: string, r: ReturnType<typeof route> | null, extra: Partial<Parameters<typeof calculatePlaceTaDa>[0]> = {}) =>
  rows(calculatePlaceTaDa({ workingType: 'FIELD_WORK', from, to, ownHqId, route: r, rates, maxKm: 100, ...extra }));

describe('From → To TA/DA, measured against the HQ the employee is based in (2026-11-26)', () => {
  it('the kind of day', () => {
    expect(placeDayKind(J, mainaguri, 'J')).toBe('DAY_TRIP');
    expect(placeDayKind(J, dhupguri, 'J')).toBe('AWAY');
    expect(placeDayKind(dhupguri, dhupguri, 'J')).toBe('STAY');
    expect(placeDayKind(dhupguri, J, 'J')).toBe('RETURN');
    // The same place is home-side for its own MR and away for a manager from another HQ.
    expect(placeDayKind(S, mainaguri, 'S')).toBe('AWAY');
  });

  it('an MR of Jalpaiguri: a day trip pays there and back, an HQ place nothing, out-station one way each way', () => {
    expect(calc(J, mainaguri, 'J', route('r-main', '20'))).toEqual(['TA:12000', 'DA:20000']);
    expect(calc(J, stationRd, 'J', route('r-stn', '6'))).toEqual([]);
    expect(calc(J, dhupguri, 'J', route('r-dhup', '45'))).toEqual(['TA:13500', 'DA:50000']);
    expect(calc(dhupguri, dhupguri, 'J', null)).toEqual(['DA:50000']);
    expect(calc(dhupguri, J, 'J', route('r-dhup', '45'))).toEqual(['TA:13500', 'DA:20000']);
  });

  it("a ZSM of Siliguri on a week in the team's HQs: out-station every day until the return, with the cap", () => {
    expect(calc(S, mainaguri, 'S', route('r1', '65'))).toEqual(['TA:19500', 'DA:50000']);
    expect(calc(mainaguri, dhupguri, 'S', route('r2', '25'))).toEqual(['TA:7500', 'DA:50000']);
    expect(calc(dhupguri, dhupguri, 'S', null)).toEqual(['DA:50000']);
    expect(calc(dhupguri, chalsa, 'S', route('r4', '110'))).toEqual(['TA:30000', 'DA:50000']);
    expect(calc(chalsa, S, 'S', route('r5', '70'))).toEqual(['TA:21000', 'DA:20000']);
  });

  it('caps the one-way km first, then doubles a day trip', () => {
    const far = place('far', 'J', 'EX_STATION');
    expect(calc(J, far, 'J', route('r', '60'))).toEqual(['TA:36000', 'DA:20000']);
    expect(calc(J, far, 'J', route('r', '130'))).toEqual(['TA:60000', 'DA:20000']);
  });

  it("a fixed fare is paid as typed, each way, never doubled or capped; a route's own rate replaces the grade's", () => {
    expect(calc(J, dhupguri, 'J', route('r', '45', { taFixedPaise: 20000 }))).toEqual(['TA:20000', 'DA:50000']);
    expect(calc(J, mainaguri, 'J', route('r', '200', { taFixedPaise: 15000 }))).toEqual(['TA:15000', 'DA:20000']);
    expect(calc(J, mainaguri, 'J', route('r', '20', { taPerKmRateOverridePaise: 500 }))).toEqual(['TA:20000', 'DA:20000']);
  });

  it('a fixed TA of 0 pays no TA for the day; DA is paid as usual (2026-11-28)', () => {
    expect(calc(J, dhupguri, 'J', route('r', '45', { taFixedPaise: 0 }))).toEqual(['DA:50000']);
    expect(calc(J, mainaguri, 'J', route('r', '200', { taFixedPaise: 0 }))).toEqual(['DA:20000']);
  });

  it('a route with no km is a flagged zero; a day at one home-side place is paid on the route that reaches it', () => {
    expect(calc(J, dhupguri, 'J', route('r', null))).toEqual(['TA:0!', 'DA:50000']);
    expect(calc(mainaguri, mainaguri, 'J', null, { homeRoute: route('r-main', '20') })).toEqual(['TA:12000', 'DA:20000']);
  });

  it('a doctor campaign earns DA only; a strike nothing', () => {
    expect(calc(J, dhupguri, 'J', route('r', '45'), { workingType: 'DOCTOR_CAMPAIGN' })).toEqual(['DA:50000']);
    expect(calc(J, dhupguri, 'J', route('r', '45'), { workingType: 'STRIKE' })).toEqual([]);
  });
});
