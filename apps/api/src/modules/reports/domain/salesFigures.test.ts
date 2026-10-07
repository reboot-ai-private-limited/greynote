import { describe, expect, it } from 'vitest';
import { buildSalesMonths, buildStatement, previousMonth, secondaryQty, valueOf, yearMonths, type OrderSum, type StockCount } from './salesFigures.js';

const sum = (month: string, distributorId: string, productId: string, status: 'DONE' | 'PLACED', quantity: number, amountPaise: number): OrderSum => ({ month, distributorId, productId, status, quantity, amountPaise });
const count = (month: string, distributorId: string, productId: string, openingQty: number, closingQty: number): StockCount => ({ distributorId, productId, month, openingQty, closingQty });
const ptr = new Map<string, number | null>([['p1', 1000], ['p2', 2000], ['pNone', null]]);

describe('the arithmetic', () => {
  it('secondary is opening + primary − closing, and a value needs a price', () => {
    expect(secondaryQty(30, 100, 40)).toBe(90);
    expect(secondaryQty(30, 0, 40)).toBe(-10);
    expect(valueOf(90, 1000)).toBe(90_000);
    expect(valueOf(90, null)).toBeNull();
    expect(valueOf(0, 0)).toBe(0);
  });
  it('lists the financial year from its first day, across New Year', () => {
    expect(yearMonths('2026-04-01')).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(previousMonth('2026-04')).toBe('2026-03');
    expect(previousMonth('2027-01')).toBe('2026-12');
  });
});

describe('buildSalesMonths', () => {
  const months = yearMonths('2026-04-01');
  const base = { months, currentMonth: '2026-06', ptr, expectedDistributorIds: ['d1', 'd2'] };

  it('adds up the Done orders as primary, the Placed ones apart, and derives secondary from the counts at PTR', () => {
    const r = buildSalesMonths({
      ...base,
      orderSums: [sum('2026-04', 'd1', 'p1', 'DONE', 100, 80_000), sum('2026-04', 'd2', 'p2', 'DONE', 50, 90_000), sum('2026-04', 'd1', 'p1', 'PLACED', 10, 8_000)],
      stock: [count('2026-04', 'd1', 'p1', 30, 40), count('2026-04', 'd2', 'p2', 0, 20)],
    });
    expect(r[0]).toMatchObject({ month: '2026-04', state: 'ENDED', primaryQty: 150, primaryPaise: 170_000, placedQty: 10, placedPaise: 8_000, secondaryQty: 90 + 30, secondaryPaise: 90 * 1000 + 30 * 2000, countedDistributors: 2, expectedDistributors: 2, complete: true });
  });

  it('a month where a distributor did not count is not complete, and says how many did', () => {
    const r = buildSalesMonths({ ...base, orderSums: [], stock: [count('2026-04', 'd1', 'p1', 10, 4)] });
    expect(r[0]).toMatchObject({ countedDistributors: 1, expectedDistributors: 2, complete: false, secondaryQty: 6 });
  });

  it('a month with no counts has primary but no secondary — a gap, not zero; the open month is open; future months are empty', () => {
    const r = buildSalesMonths({ ...base, orderSums: [sum('2026-05', 'd1', 'p1', 'DONE', 5, 5_000), sum('2026-06', 'd1', 'p1', 'DONE', 2, 2_000)], stock: [] });
    expect(r[1]).toMatchObject({ state: 'ENDED', primaryPaise: 5_000, secondaryQty: null, secondaryPaise: null, complete: false });
    expect(r[2]).toMatchObject({ state: 'OPEN', primaryPaise: 2_000, secondaryQty: null });
    expect(r[3]).toMatchObject({ state: 'FUTURE', primaryPaise: 0, secondaryQty: null });
    expect(r.filter((m) => m.state === 'FUTURE')).toHaveLength(9);
  });

  it('leaves a count that comes out negative out of the totals and counts it as an error', () => {
    const r = buildSalesMonths({ ...base, orderSums: [], stock: [count('2026-04', 'd1', 'p1', 5, 50), count('2026-04', 'd1', 'p2', 10, 4)] });
    expect(r[0]).toMatchObject({ negativeRows: 1, secondaryQty: 6, secondaryPaise: 12_000 });
  });

  it('a product with no PTR counts in the quantity, not in the value', () => {
    const r = buildSalesMonths({ ...base, orderSums: [], stock: [count('2026-04', 'd1', 'pNone', 10, 4), count('2026-04', 'd1', 'p1', 10, 4)] });
    expect(r[0]).toMatchObject({ secondaryQty: 12, secondaryPaise: 6_000, unpricedRows: 1 });
  });

  it('counts only expected (active) distributors towards completeness, and an empty roster is never complete', () => {
    expect(buildSalesMonths({ ...base, orderSums: [], stock: [count('2026-04', 'gone', 'p1', 1, 0)] })[0]).toMatchObject({ countedDistributors: 0, complete: false });
    expect(buildSalesMonths({ ...base, expectedDistributorIds: [], orderSums: [], stock: [count('2026-04', 'd1', 'p1', 1, 0)] })[0]).toMatchObject({ complete: false });
  });
});

describe('buildStatement', () => {
  const stmt = (orderSums: OrderSum[], stock: StockCount[]) => buildStatement({ month: '2026-05', orderSums, stock, ptr });

  it('a row per distributor and product with a count or an order: opening, primary, closing, and secondary at PTR', () => {
    const rows = stmt(
      [sum('2026-05', 'd1', 'p1', 'DONE', 100, 80_000), sum('2026-05', 'd1', 'p1', 'PLACED', 7, 5_600), sum('2026-04', 'd1', 'p1', 'DONE', 999, 1)],
      [count('2026-05', 'd1', 'p1', 40, 50), count('2026-04', 'd1', 'p1', 30, 40)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ distributorId: 'd1', productId: 'p1', openingQty: 40, primaryQty: 100, primaryPaise: 80_000, placedQty: 7, closingQty: 50, secondaryQty: 90, secondaryPaise: 90_000, flags: [] });
  });

  it('flags an opening that is not what the distributor closed the month before with', () => {
    const rows = stmt([], [count('2026-05', 'd1', 'p1', 45, 40), count('2026-04', 'd1', 'p1', 30, 40)]);
    expect(rows[0]!.flags).toEqual(['OPENING_MISMATCH']);
  });

  it('an order with no count has no opening, closing or secondary, and says so', () => {
    const rows = stmt([sum('2026-05', 'd2', 'p2', 'DONE', 10, 18_000)], []);
    expect(rows[0]).toMatchObject({ distributorId: 'd2', openingQty: null, closingQty: null, secondaryQty: null, secondaryPaise: null, primaryQty: 10, flags: ['NO_COUNT'] });
  });

  it('a negative secondary is flagged and has no value; a product without a PTR is flagged unpriced', () => {
    const rows = stmt([], [count('2026-05', 'd1', 'p1', 5, 50), count('2026-05', 'd1', 'pNone', 10, 4)]);
    const byProduct = Object.fromEntries(rows.map((r) => [r.productId, r]));
    expect(byProduct['p1']).toMatchObject({ secondaryQty: -45, secondaryPaise: null, flags: ['NEGATIVE_SECONDARY'] });
    expect(byProduct['pNone']).toMatchObject({ secondaryQty: 6, secondaryPaise: null, flags: ['UNPRICED'] });
  });

  it('a first month has no previous count to disagree with', () => {
    expect(stmt([], [count('2026-05', 'd1', 'p1', 45, 40)])[0]!.flags).toEqual([]);
  });
});
