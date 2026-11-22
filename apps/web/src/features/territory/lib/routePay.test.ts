import type { PayBandDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { routePayPreview } from './routePay';

const g1: PayBandDto = { id: 'g1', name: 'G1', taPerKmRatePaise: 750, hqDaPaise: 0, exStationDaPaise: 20_000, outStationDaPaise: 50_000 };
const g2: PayBandDto = { id: 'g2', name: 'G2', taPerKmRatePaise: 900, hqDaPaise: 10_000, exStationDaPaise: 25_000, outStationDaPaise: 60_000 };
const base = { overridePaise: null, capKm: 99, grades: [g2, g1] };

describe('routePayPreview', () => {
  it('pays km × the grade rate, with the grade DA for the route type', () => {
    const p = routePayPreview({ ...base, distanceKm: '60', type: 'EX_STATION' });
    expect(p.rows.map((r) => [r.gradeName, r.taPaise, r.daPaise, r.totalPaise])).toEqual([['G1', 45_000, 20_000, 65_000], ['G2', 54_000, 25_000, 79_000]]);
    expect(p.capped).toBe(false);
  });
  it('pays at most the cap and says so', () => {
    const p = routePayPreview({ ...base, distanceKm: '120', type: 'OUT_STATION' });
    expect(p.paidKm).toBe(99);
    expect(p.capped).toBe(true);
    expect(p.rows[0]!.taPaise).toBe(74_250);
  });
  it("the route's own rate replaces every grade's", () => {
    const p = routePayPreview({ ...base, distanceKm: '10', type: 'EX_STATION', overridePaise: 1000 });
    expect(p.rows.map((r) => [r.taRatePaise, r.taPaise, r.overridden])).toEqual([[1000, 10_000, true], [1000, 10_000, true]]);
  });
  it('an HQ route earns no TA, only the HQ DA', () => {
    const p = routePayPreview({ ...base, distanceKm: '8', type: 'HQ' });
    expect(p.noTa).toBe(true);
    expect(p.rows.map((r) => [r.taPaise, r.daPaise])).toEqual([[0, 0], [0, 10_000]]);
  });
  it('rounds a half paise up, once', () => {
    expect(routePayPreview({ ...base, distanceKm: '0.01', type: 'EX_STATION', grades: [{ ...g1, taPerKmRatePaise: 50 }] }).rows[0]!.taPaise).toBe(1); // 0.5 paise → 1
    expect(routePayPreview({ ...base, distanceKm: '12.34', type: 'EX_STATION', grades: [{ ...g1, taPerKmRatePaise: 750 }] }).rows[0]!.taPaise).toBe(9255);
  });
  it('shows nothing paid while the km is empty, and no DA while the type is unknown', () => {
    const p = routePayPreview({ ...base, distanceKm: '', type: null });
    expect(p.paidKm).toBeNull();
    expect(p.rows[0]).toMatchObject({ taPaise: 0, daPaise: null, totalPaise: null });
  });
});
