import { describe, expect, it } from 'vitest';
import { groupRows, type BreakdownRow } from './salesBreakdown.js';
import { windowMonths } from './salesWindow.js';

const row = (o: Partial<BreakdownRow>): BreakdownRow => ({ month: '2026-04', distributorId: 'd1', productId: 'p1', primaryQty: 0, primaryPaise: 0, secondaryQty: null, secondaryPaise: null, ...o });

describe('windowMonths', () => {
  const firstDay = '2026-04-01';
  it('year is twelve months, a quarter is three of them, a month is one', () => {
    expect(windowMonths({ firstDay, period: 'year' })).toHaveLength(12);
    expect(windowMonths({ firstDay, period: 'quarter', quarter: 1 })).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(windowMonths({ firstDay, period: 'quarter', quarter: 4 })).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(windowMonths({ firstDay, period: 'month', month: '2026-11' })).toEqual(['2026-11']);
  });
  it('refuses a month outside the year and a missing quarter', () => {
    expect(() => windowMonths({ firstDay, period: 'month', month: '2027-04' })).toThrow();
    expect(() => windowMonths({ firstDay, period: 'quarter' })).toThrow();
  });
});

describe('groupRows', () => {
  it('adds a key up across months and partners, leaving out a negative secondary', () => {
    const rows = [
      row({ primaryQty: 10, primaryPaise: 1000, secondaryQty: 4, secondaryPaise: 400 }),
      row({ month: '2026-05', distributorId: 'd2', primaryQty: 5, primaryPaise: 500, secondaryQty: -3, secondaryPaise: null }),
      row({ productId: 'p2', primaryQty: 1, primaryPaise: 100 }),
    ];
    const byProduct = groupRows(rows, (r) => r.productId);
    expect(byProduct.get('p1')).toEqual({ primaryQty: 15, primaryPaise: 1500, secondaryQty: 4, secondaryPaise: 400 });
    expect(byProduct.get('p2')).toEqual({ primaryQty: 1, primaryPaise: 100, secondaryQty: 0, secondaryPaise: 0 });
    expect(groupRows(rows, (r) => r.distributorId).get('d1')?.primaryQty).toBe(11);
  });
});
