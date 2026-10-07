import type { SalesMonthDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { chartValues, compactQty, compactRupees, layoutBars, monthTick, niceTicks } from './salesChart';

const month = (over: Partial<SalesMonthDto> = {}): SalesMonthDto => ({
  month: '2026-04',
  state: 'ENDED',
  primaryQty: 100,
  primaryPaise: 5_000_000,
  placedQty: 0,
  placedPaise: 0,
  secondaryQty: 80,
  secondaryPaise: 4_000_000,
  countedDistributors: 3,
  expectedDistributors: 3,
  complete: true,
  negativeRows: 0,
  unpricedRows: 0,
  ...over,
});
const size = { width: 760, height: 320, left: 60, right: 10, top: 10, bottom: 30 };

describe('niceTicks', () => {
  it('starts at zero and steps in round amounts to just past the largest figure', () => {
    expect(niceTicks(56_990)).toEqual([0, 20_000, 40_000, 60_000]);
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
  });
  it('has a sensible axis for no data', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1]);
  });
});

describe('short figures', () => {
  it('writes rupees the Indian way', () => {
    expect(compactRupees(95_000)).toBe('₹950');
    expect(compactRupees(1_240_000)).toBe('₹12.4 K');
    expect(compactRupees(57_000_000)).toBe('₹5.7 L');
    expect(compactRupees(1_200_000_000)).toBe('₹1.2 Cr');
    expect(compactRupees(0)).toBe('₹0');
  });
  it('writes quantities', () => {
    expect(compactQty(950)).toBe('950');
    expect(compactQty(12_400)).toBe('12.4k');
  });
  it('labels a month by its short name and year', () => {
    expect(monthTick('2026-04')).toBe('Apr 26');
    expect(monthTick('2027-03')).toBe('Mar 27');
  });
});

describe('chartValues', () => {
  it('uses value or quantity, and draws nothing for a future month or a missing secondary', () => {
    expect(chartValues(month(), 'VALUE')).toEqual({ primary: 5_000_000, secondary: 4_000_000 });
    expect(chartValues(month(), 'QTY')).toEqual({ primary: 100, secondary: 80 });
    expect(chartValues(month({ state: 'FUTURE' }), 'VALUE')).toEqual({ primary: null, secondary: null });
    expect(chartValues(month({ secondaryPaise: null, secondaryQty: null }), 'VALUE').secondary).toBeNull();
  });
});

describe('layoutBars', () => {
  const months = [month({ month: '2026-04', primaryPaise: 5_000_000, secondaryPaise: 2_500_000 }), month({ month: '2026-05', state: 'FUTURE' }), month({ month: '2026-06', secondaryPaise: null, secondaryQty: null })];
  const layout = layoutBars(months, 'VALUE', size);

  it('puts the primary bar left of the secondary in each group, the tallest to the top of the axis', () => {
    const g = layout.groups[0]!;
    expect(g.primary!.x).toBeLessThan(g.secondary!.x);
    expect(g.primary!.height).toBeCloseTo(2 * g.secondary!.height, 5);
    expect(g.primary!.y + g.primary!.height).toBeCloseTo(layout.baseline, 5);
    expect(layout.top).toBeGreaterThanOrEqual(5_000_000);
  });
  it('leaves a future month, and a missing secondary, without a bar', () => {
    expect(layout.groups[1]).toMatchObject({ primary: null, secondary: null });
    expect(layout.groups[2]!.primary).not.toBeNull();
    expect(layout.groups[2]!.secondary).toBeNull();
  });
  it('spreads the groups evenly inside the margins and orders the ticks bottom to top', () => {
    const [a, b, c] = layout.groups;
    expect(b!.centerX - a!.centerX).toBeCloseTo(c!.centerX - b!.centerX, 5);
    expect(a!.slot.x).toBeGreaterThanOrEqual(size.left);
    expect(layout.ticks[0]!.value).toBe(0);
    expect(layout.ticks[0]!.y).toBeCloseTo(layout.baseline, 5);
    expect(layout.ticks.at(-1)!.y).toBeLessThan(layout.ticks[0]!.y);
  });
  it('an all-zero year still has an axis and no bar higher than the baseline', () => {
    const empty = layoutBars([month({ primaryPaise: 0, secondaryPaise: 0 })], 'VALUE', size);
    expect(empty.groups[0]!.primary!.height).toBe(0);
  });
});
