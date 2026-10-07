import { describe, expect, it } from 'vitest';
import type { OrderSumRow, StockRow } from '../domain/ports.js';
import { SalesReport } from './salesReport.js';
import { StockReport } from './stockReport.js';

const d = (month: string, distributorId: string, productId: string, status: 'DONE' | 'PLACED', quantity: number, amountPaise: number): OrderSumRow => ({ month, distributorId, productId, status, quantity, amountPaise });
const s = (outlet: StockRow['outlet'], productId: string, month: string, openingQty: number, closingQty: number): StockRow => ({ outlet, productId, month, openingQty, closingQty });
const dist = (id: string) => ({ type: 'DISTRIBUTOR' as const, id });
const chem = (id: string) => ({ type: 'CHEMIST' as const, id });

function kit(orderSums: OrderSumRow[], stock: StockRow[]) {
  const calls: Array<{ kind: string; filter: Record<string, unknown> }> = [];
  const sales = {
    listOrders: async () => [],
    getOrder: async () => null,
    sumDistributorOrders: async (f: Record<string, unknown> & { from: string; to: string }) => {
      calls.push({ kind: 'orders', filter: f });
      return orderSums.filter((o) => o.month >= f.from.slice(0, 7) && o.month <= f.to.slice(0, 7) && (!f['distributorId'] || o.distributorId === f['distributorId']));
    },
    listStockRange: async (f: { fromMonth: string; toMonth: string; outletType: 'CHEMIST' | 'DISTRIBUTOR'; outletId?: string }) => {
      calls.push({ kind: 'stock', filter: f });
      return stock.filter((r) => r.outlet.type === f.outletType && r.month >= f.fromMonth && r.month <= f.toMonth && (!f.outletId || r.outlet.id === f.outletId));
    },
  };
  const names = {
    distributors: [{ id: 'd1', name: 'Shree' }, { id: 'd2', name: 'Maa Tara' }, { id: 'd3', name: 'Himalaya' }],
    chemists: [{ id: 'c1', name: 'Sai Medical' }, { id: 'c2', name: 'City Chemists' }],
    products: [{ id: 'p1', name: 'XYZ-500', sku: 'XYZ-500', ptrPaise: 1000 }, { id: 'p2', name: 'Cetirizine', sku: 'CET', ptrPaise: 2000 }],
  };
  const master = {
    listActiveOutlets: async () => ({ distributors: names.distributors.filter((x) => x.id !== 'd3'), chemists: names.chemists }), // d3 is inactive
    listNames: async (q: { distributorIds?: string[]; chemistIds?: string[]; productIds?: string[] }) => ({
      distributors: names.distributors.filter((x) => (q.distributorIds ?? []).includes(x.id)),
      chemists: names.chemists.filter((x) => (q.chemistIds ?? []).includes(x.id)),
      products: names.products.filter((x) => (q.productIds ?? []).includes(x.id)),
    }),
  };
  const config = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_START_MONTH: 'APRIL' })[key] ?? '' };
  const now = () => new Date('2026-10-07T06:00:00Z');
  return { sales: new SalesReport(sales, master, config, now), stock: new StockReport(sales, master), calls };
}

describe('the sales year', () => {
  it('twelve months from April: primary and secondary per month, the open month open, the rest of the year empty', async () => {
    const r = await kit(
      [d('2026-04', 'd1', 'p1', 'DONE', 100, 80_000), d('2026-10', 'd1', 'p1', 'DONE', 20, 16_000)],
      [s(dist('d1'), 'p1', '2026-04', 30, 40), s(dist('d2'), 'p1', '2026-04', 0, 0)],
    ).sales.year({ year: 2026 });
    expect(r.months.map((m) => m.month)[0]).toBe('2026-04');
    expect(r.months).toHaveLength(12);
    expect(r.months[0]).toMatchObject({ state: 'ENDED', primaryQty: 100, primaryPaise: 80_000, secondaryQty: 90, secondaryPaise: 90_000, countedDistributors: 2, expectedDistributors: 2, complete: true });
    expect(r.months[6]).toMatchObject({ month: '2026-10', state: 'OPEN', primaryPaise: 16_000, secondaryQty: null });
    expect(r.months[7]!.state).toBe('FUTURE');
    expect(r.totals).toEqual({ primaryQty: 120, primaryPaise: 96_000, secondaryQty: 90, secondaryPaise: 90_000 });
  });

  it('asks Sales for the whole year and, for one distributor, only that one — whose completeness is its own', async () => {
    const k = kit([], [s(dist('d1'), 'p1', '2026-04', 10, 4)]);
    const r = await k.sales.year({ year: 2026, distributorId: 'd1' });
    expect(k.calls.find((c) => c.kind === 'orders')!.filter).toMatchObject({ from: '2026-04-01', to: '2027-03-31', distributorId: 'd1' });
    expect(k.calls.find((c) => c.kind === 'stock')!.filter).toMatchObject({ fromMonth: '2026-04', toMonth: '2027-03', outletId: 'd1' });
    expect(r.months[0]).toMatchObject({ expectedDistributors: 1, countedDistributors: 1, complete: true });
  });
});

describe('the sales statement', () => {
  it('names each distributor and product, sorts them, adds up the totals and lists who did not count', async () => {
    const r = await kit(
      [d('2026-05', 'd1', 'p1', 'DONE', 100, 80_000), d('2026-05', 'd1', 'p1', 'PLACED', 7, 5_600), d('2026-05', 'd2', 'p2', 'DONE', 10, 18_000)],
      [s(dist('d1'), 'p1', '2026-05', 40, 50), s(dist('d1'), 'p1', '2026-04', 30, 40)],
    ).sales.statement({ month: '2026-05' });
    expect(r.rows.map((x) => [x.distributor.name, x.product.name, x.flags])).toEqual([
      ['Maa Tara', 'Cetirizine', ['NO_COUNT']],
      ['Shree', 'XYZ-500', []],
    ]);
    expect(r.rows[1]).toMatchObject({ openingQty: 40, primaryQty: 100, placedQty: 7, closingQty: 50, secondaryQty: 90, secondaryPaise: 90_000 });
    expect(r.missingDistributors.map((x) => x.name)).toEqual(['Maa Tara']);
    expect(r.totals).toEqual({ primaryQty: 110, primaryPaise: 98_000, placedPaise: 5_600, secondaryQty: 90, secondaryPaise: 90_000 });
  });
});

describe('the stock report', () => {
  it('lists every count, flags an opening that is not last closing and a negative secondary, and names who has not counted', async () => {
    const r = await kit(
      [d('2026-05', 'd1', 'p1', 'DONE', 5, 4_000)],
      [
        s(dist('d1'), 'p1', '2026-04', 30, 40),
        s(dist('d1'), 'p1', '2026-05', 45, 20), // opens at 45 after closing 40; 45 + 5 − 20 = 30 fine
        s(dist('d1'), 'p2', '2026-05', 1, 90), // negative secondary
        s(chem('c1'), 'p1', '2026-05', 10, 6),
      ],
    ).stock.month({ month: '2026-05' });
    const find = (outlet: string, product: string | null) => r.rows.find((x) => x.outlet.name === outlet && (x.product?.name ?? null) === product)!;
    expect(find('Shree', 'XYZ-500')).toMatchObject({ openingQty: 45, previousClosingQty: 40, closingQty: 20, flags: ['OPENING_MISMATCH'] });
    expect(find('Shree', 'Cetirizine')).toMatchObject({ flags: ['NEGATIVE_SECONDARY'] });
    expect(find('Sai Medical', 'XYZ-500').flags).toEqual([]);
    expect(find('Maa Tara', null)).toMatchObject({ outletType: 'DISTRIBUTOR', flags: ['NO_COUNT'] });
    expect(find('City Chemists', null).flags).toEqual(['NO_COUNT']);
    expect(r.completeness).toEqual({ distributors: { counted: 1, expected: 2 }, chemists: { counted: 1, expected: 2 } });
    expect(r.flagged).toBe(4);
  });

  it('an inactive outlet that counted still shows with its name, and an empty month is all gaps', async () => {
    const k = kit([], [s(dist('d3'), 'p1', '2026-05', 5, 2)]);
    const r = await k.stock.month({ month: '2026-05' });
    expect(r.rows.find((x) => x.outlet.id === 'd3')).toMatchObject({ outlet: { name: 'Himalaya' }, closingQty: 2 });
    expect(r.completeness.distributors).toEqual({ counted: 0, expected: 2 });
    const empty = await kit([], []).stock.month({ month: '2026-05' });
    expect(empty.rows.every((x) => x.flags.includes('NO_COUNT'))).toBe(true);
    expect(empty.rows).toHaveLength(4);
  });
});
