import { describe, expect, it } from 'vitest';
import { calculateTaDa, type DayRoute, type PayRates } from './taDaCalculator.js';

const rates: PayRates = { taPerKmRatePaise: 750, hqDaPaise: 0, exStationDaPaise: 20000, outStationDaPaise: 50000 };
const route = (id: string, over: Partial<DayRoute> = {}): DayRoute => ({ id, routeType: 'HQ', distanceKm: '10.67', distanceStatus: 'CALCULATED', taPerKmRateOverridePaise: null, ...over });

describe('TA/DA calculation (hld/06)', () => {
  it('FIELD_WORK: TA is distance × the Pay Band rate, rounded half up to a whole paise once', () => {
    // 10.67 km × ₹7.50 = ₹80.025 → 8003 paise (half up)
    expect(calculateTaDa('FIELD_WORK', [route('r1')], ['r1'], rates)).toEqual([{ type: 'TA', routeId: 'r1', amountPaise: 8003, distanceFlag: false }]);
  });

  it('a Route’s own rate beats the Pay Band’s, per Route, inside the sum', () => {
    const out = calculateTaDa('FIELD_WORK', [route('r1', { taPerKmRateOverridePaise: 1000, distanceKm: '10.00' }), route('r2', { distanceKm: '10.00' })], ['r1', 'r2'], rates);
    expect(out.filter((x) => x.type === 'TA').map((x) => x.amountPaise)).toEqual([10000, 7500]);
  });

  it('each Route is rounded on its own — the day’s TA is the sum of rounded amounts, not a rounded total', () => {
    const out = calculateTaDa('FIELD_WORK', [route('r1', { distanceKm: '0.01' }), route('r2', { distanceKm: '0.01' })], ['r1', 'r2'], { ...rates, taPerKmRatePaise: 50 });
    // 0.01 km × 50 paise = 0.5 → 1 paise each (half up), 2 total — a rounded total would be 1
    expect(out.filter((x) => x.type === 'TA').map((x) => x.amountPaise)).toEqual([1, 1]);
  });

  it('a Route whose distance could not be calculated, or is unknown, is a zero row flagged — TA never blocks', () => {
    const out = calculateTaDa('FIELD_WORK', [route('r1', { distanceStatus: 'FAILED', distanceKm: null }), null, route('r3', { distanceKm: '10.00' })], ['r1', 'r2', 'r3'], rates);
    expect(out.filter((x) => x.type === 'TA')).toEqual([
      { type: 'TA', routeId: 'r1', amountPaise: 0, distanceFlag: true },
      { type: 'TA', routeId: 'r2', amountPaise: 0, distanceFlag: true },
      { type: 'TA', routeId: 'r3', amountPaise: 7500, distanceFlag: false },
    ]);
  });

  it('DA is one amount for the day at the highest Route type among the Routes', () => {
    const routes = [route('r1', { routeType: 'HQ' }), route('r2', { routeType: 'OUT_STATION' }), route('r3', { routeType: 'EX_STATION' })];
    const da = calculateTaDa('FIELD_WORK', routes, ['r1', 'r2', 'r3'], rates).filter((x) => x.type === 'DA');
    expect(da).toEqual([{ type: 'DA', routeId: null, amountPaise: 50000, distanceFlag: false }]);
    expect(calculateTaDa('FIELD_WORK', [route('a', { routeType: 'EX_STATION' }), route('b')], ['a', 'b'], rates).find((x) => x.type === 'DA')!.amountPaise).toBe(20000);
  });

  it('MEETING and CONFERENCE: DA at the HQ rate only, no TA; a ₹0 HQ rate writes nothing', () => {
    expect(calculateTaDa('MEETING', [], [], { ...rates, hqDaPaise: 15000 })).toEqual([{ type: 'DA', routeId: null, amountPaise: 15000, distanceFlag: false }]);
    expect(calculateTaDa('CONFERENCE', [], [], { ...rates, hqDaPaise: 15000 }).map((x) => x.type)).toEqual(['DA']);
    expect(calculateTaDa('MEETING', [], [], rates)).toEqual([]);
  });

  it('STRIKE: nothing', () => {
    expect(calculateTaDa('STRIKE', [route('r1')], ['r1'], { ...rates, hqDaPaise: 999 })).toEqual([]);
  });

  it('every amount is a whole number of paise', () => {
    for (const x of calculateTaDa('FIELD_WORK', [route('r1', { distanceKm: '33.333', routeType: 'EX_STATION' })], ['r1'], rates)) expect(Number.isInteger(x.amountPaise)).toBe(true);
  });
});
