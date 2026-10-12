import { describe, expect, it } from 'vitest';
import { calculateTaDa, type DayRoute, type PayRates } from './taDaCalculator.js';

const rates: PayRates = { taPerKmRatePaise: 750, hqDaPaise: 0, exStationDaPaise: 20000, outStationDaPaise: 50000 };
const calc = (workingType: Parameters<typeof calculateTaDa>[0], routes: Parameters<typeof calculateTaDa>[1], routeIds: string[], r: PayRates, maxKm = 99) => calculateTaDa(workingType, routes, routeIds, r, maxKm);
const route = (id: string, over: Partial<DayRoute> = {}): DayRoute => ({ id, routeType: 'EX_STATION', distanceKm: '10.67', distanceStatus: 'CALCULATED', taPerKmRateOverridePaise: null, ...over });

describe('TA/DA calculation (hld/06)', () => {
  it('FIELD_WORK: TA is distance × the Pay Band rate, rounded half up to a whole paise once', () => {
    // 10.67 km × ₹7.50 = ₹80.025 → 8003 paise (half up)
    expect(calc('FIELD_WORK', [route('r1')], ['r1'], rates).filter((x) => x.type === 'TA')).toEqual([{ type: 'TA', routeId: 'r1', amountPaise: 8003, distanceFlag: false }]);
  });

  it('a Route’s own rate beats the Pay Band’s', () => {
    const out = calc('FIELD_WORK', [route('r1', { taPerKmRateOverridePaise: 1000, distanceKm: '10.00' })], ['r1'], rates);
    expect(out.filter((x) => x.type === 'TA').map((x) => x.amountPaise)).toEqual([10000]);
  });

  it('a Route whose distance could not be calculated, or is unknown, is a zero row flagged — TA never blocks', () => {
    const out = calc('FIELD_WORK', [route('r1', { distanceStatus: 'FAILED', distanceKm: null }), null, route('r3', { distanceKm: '10.00' })], ['r1', 'r2', 'r3'], rates);
    expect(out.filter((x) => x.type === 'TA')).toEqual([
      { type: 'TA', routeId: 'r1', amountPaise: 0, distanceFlag: true },
      { type: 'TA', routeId: 'r2', amountPaise: 0, distanceFlag: true },
      { type: 'TA', routeId: 'r3', amountPaise: 7500, distanceFlag: false },
    ]);
  });

  it('DA is one amount for the day at the highest Route type among the Routes', () => {
    const routes = [route('r1', { routeType: 'HQ' }), route('r2', { routeType: 'OUT_STATION' }), route('r3', { routeType: 'EX_STATION' })];
    const da = calc('FIELD_WORK', routes, ['r1', 'r2', 'r3'], rates).filter((x) => x.type === 'DA');
    expect(da).toEqual([{ type: 'DA', routeId: null, amountPaise: 50000, distanceFlag: false }]);
    expect(calc('FIELD_WORK', [route('a', { routeType: 'EX_STATION' }), route('b')], ['a', 'b'], rates).find((x) => x.type === 'DA')!.amountPaise).toBe(20000);
  });

  it('DOCTOR_CAMPAIGN: no TA at all, whatever the distance; DA at the highest Route type like field work', () => {
    const routes = [route('r1', { routeType: 'EX_STATION', distanceKm: '40.00' }), route('r2', { routeType: 'OUT_STATION', distanceKm: '80.00' })];
    expect(calc('DOCTOR_CAMPAIGN', routes, ['r1', 'r2'], rates)).toEqual([{ type: 'DA', routeId: null, amountPaise: 50000, distanceFlag: false }]);
    expect(calc('DOCTOR_CAMPAIGN', [route('r1', { routeType: 'HQ' })], ['r1'], rates)).toEqual([]); // an HQ day at a ₹0 HQ rate writes nothing
  });

  it('MEETING and CONFERENCE: DA at the HQ rate only, no TA; a ₹0 HQ rate writes nothing', () => {
    expect(calc('MEETING', [], [], { ...rates, hqDaPaise: 15000 })).toEqual([{ type: 'DA', routeId: null, amountPaise: 15000, distanceFlag: false }]);
    expect(calc('CONFERENCE', [], [], { ...rates, hqDaPaise: 15000 }).map((x) => x.type)).toEqual(['DA']);
    expect(calc('MEETING', [], [], rates)).toEqual([]);
  });

  it('STRIKE: nothing', () => {
    expect(calc('STRIKE', [route('r1')], ['r1'], { ...rates, hqDaPaise: 999 })).toEqual([]);
  });

  it('every amount is a whole number of paise', () => {
    for (const x of calc('FIELD_WORK', [route('r1', { distanceKm: '33.333', routeType: 'EX_STATION' })], ['r1'], rates)) expect(Number.isInteger(x.amountPaise)).toBe(true);
  });

  describe('an out-station trip: first day, stay days, the way back', () => {
    const out = [route('r1', { routeType: 'OUT_STATION', distanceKm: '80.00' })];
    const tripDay = (kind: 'NORMAL' | 'STAY' | 'TRANSIT') => calculateTaDa('FIELD_WORK', out, ['r1'], rates, 99, kind);

    it('the first day is TA and the out-station DA', () => {
      expect(tripDay('NORMAL')).toEqual([
        { type: 'TA', routeId: 'r1', amountPaise: 60000, distanceFlag: false },
        { type: 'DA', routeId: null, amountPaise: 50000, distanceFlag: false },
      ]);
    });

    it('a stay day is the out-station DA and no TA', () => {
      expect(tripDay('STAY')).toEqual([{ type: 'DA', routeId: null, amountPaise: 50000, distanceFlag: false }]);
    });

    it('the transit day is TA, with DA at the ex-station rate', () => {
      expect(tripDay('TRANSIT')).toEqual([
        { type: 'TA', routeId: 'r1', amountPaise: 60000, distanceFlag: false },
        { type: 'DA', routeId: null, amountPaise: 20000, distanceFlag: false },
      ]);
    });
  });

  describe('only the day’s longest Route is paid, for at most maxKm', () => {
    const ta = (out: ReturnType<typeof calc>) => out.filter((x) => x.type === 'TA').map((x) => [x.routeId, x.amountPaise]);
    const r = { ...rates, taPerKmRatePaise: 100 };

    it('pays the longest of several Routes and nothing for the others', () => {
      const routes = [route('a', { distanceKm: '12.00' }), route('b', { distanceKm: '30.50' }), route('c', { distanceKm: '8.00' })];
      expect(ta(calc('FIELD_WORK', routes, ['a', 'b', 'c'], r))).toEqual([['b', 3050]]);
    });

    it('on a tie the first Route in plan order is paid', () => {
      expect(ta(calc('FIELD_WORK', [route('a', { distanceKm: '10.00' }), route('b', { distanceKm: '10.00' })], ['a', 'b'], r))).toEqual([['a', 1000]]);
    });

    it('pays exactly up to the cap and no more', () => {
      expect(ta(calc('FIELD_WORK', [route('a', { distanceKm: '99.00' })], ['a'], r))).toEqual([['a', 9900]]);
      expect(ta(calc('FIELD_WORK', [route('a', { distanceKm: '98.99' })], ['a'], r))).toEqual([['a', 9899]]);
      expect(ta(calc('FIELD_WORK', [route('a', { distanceKm: '100.00' })], ['a'], r))).toEqual([['a', 9900]]);
      expect(ta(calc('FIELD_WORK', [route('a', { distanceKm: '40.00' }), route('b', { distanceKm: '150.00' })], ['a', 'b'], r))).toEqual([['b', 9900]]);
    });

    it('uses the longest Route’s own rate', () => {
      const routes = [route('a', { distanceKm: '60.00', taPerKmRateOverridePaise: 200 }), route('b', { distanceKm: '20.00' })];
      expect(ta(calc('FIELD_WORK', routes, ['a', 'b'], r))).toEqual([['a', 12000]]);
    });

    it('a Route with no distance keeps its flagged zero row and is not a candidate; the cap comes from the caller', () => {
      const routes = [route('a', { distanceStatus: 'FAILED', distanceKm: null }), route('b', { distanceKm: '30.00' })];
      expect(calc('FIELD_WORK', routes, ['a', 'b'], r, 10).filter((x) => x.type === 'TA')).toEqual([
        { type: 'TA', routeId: 'a', amountPaise: 0, distanceFlag: true },
        { type: 'TA', routeId: 'b', amountPaise: 1000, distanceFlag: false },
      ]);
    });
  });

  describe('what a day earns, by working type and Route type (2026-10-06)', () => {
    const r = { taPerKmRatePaise: 100, hqDaPaise: 15000, exStationDaPaise: 20000, outStationDaPaise: 50000 };
    const kinds = (out: ReturnType<typeof calc>) => out.map((x) => `${x.type}:${x.amountPaise}`);

    it('field work on an HQ Route is DA alone, at the HQ rate: no TA', () => {
      expect(kinds(calc('FIELD_WORK', [route('a', { routeType: 'HQ', distanceKm: '8.00' })], ['a'], r))).toEqual(['DA:15000']);
    });

    it('field work on an Ex-station or Out-station Route is TA and DA', () => {
      expect(kinds(calc('FIELD_WORK', [route('a', { routeType: 'EX_STATION', distanceKm: '20.00' })], ['a'], r))).toEqual(['TA:2000', 'DA:20000']);
      expect(kinds(calc('FIELD_WORK', [route('a', { routeType: 'OUT_STATION', distanceKm: '60.00' })], ['a'], r))).toEqual(['TA:6000', 'DA:50000']);
    });

    it('a mix: TA is for the longest Route that is not an HQ Route, DA for the highest type of the day', () => {
      const routes = [route('hq', { routeType: 'HQ', distanceKm: '14.00' }), route('ex', { routeType: 'EX_STATION', distanceKm: '18.00' })];
      expect(kinds(calc('FIELD_WORK', routes, ['hq', 'ex'], r))).toEqual(['TA:1800', 'DA:20000']);
    });

    it('an HQ Route whose distance failed earns nothing and is not flagged: it would not have been paid TA anyway', () => {
      const failed = route('a', { routeType: 'HQ', distanceStatus: 'FAILED', distanceKm: null });
      expect(calc('FIELD_WORK', [failed], ['a'], r).map((x) => x.type)).toEqual(['DA']);
    });

    it('a meeting or conference is DA alone at the HQ rate, and a strike is nothing', () => {
      expect(kinds(calc('MEETING', [], [], r))).toEqual(['DA:15000']);
      expect(kinds(calc('CONFERENCE', [], [], r))).toEqual(['DA:15000']);
      expect(calc('STRIKE', [route('a')], ['a'], r)).toEqual([]);
    });
  });
});
