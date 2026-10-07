import { describe, expect, it } from 'vitest';
import type { OrderRecord } from '../domain/ports.js';
import { ORDERS_LIMIT, OrdersReport } from './ordersReport.js';

const order = (over: Partial<OrderRecord> & { id: string }): OrderRecord => ({
  userId: 'u1',
  outlet: { type: 'DISTRIBUTOR', id: 'd1' },
  orderDate: '2026-10-05',
  status: 'PLACED',
  totalAmountPaise: 100_000,
  remarks: null,
  items: [{ productId: 'p1', quantity: 10, unitPricePaise: 10_000, amountPaise: 100_000 }],
  completedBy: null,
  completedAt: null,
  ...over,
});

function kit(orders: OrderRecord[]) {
  const calls: Array<Record<string, unknown>> = [];
  const report = new OrdersReport(
    {
      listOrders: async (f) => {
        calls.push(f);
        return orders.filter((o) => (!f.from || o.orderDate >= f.from) && (!f.to || o.orderDate <= f.to) && (!f.status || o.status === f.status) && (!f.userId || o.userId === f.userId));
      },
      getOrder: async (id) => orders.find((o) => o.id === id) ?? null,
      sumDistributorOrders: async () => [],
      listStockRange: async () => [],
    },
    {
      listActiveOutlets: async () => ({ distributors: [], chemists: [] }),
      listNames: async (q) => ({
        distributors: (q.distributorIds ?? []).filter((id) => id === 'd1').map((id) => ({ id, name: 'Shree Distributors' })),
        chemists: (q.chemistIds ?? []).filter((id) => id === 'c1').map((id) => ({ id, name: 'Sai Medical' })),
        products: (q.productIds ?? []).filter((id) => id === 'p1').map((id) => ({ id, name: 'XYZ-500', sku: 'XYZ-500', ptrPaise: 9000 })),
      }),
    },
    { getUserSummaries: async (ids) => ids.filter((id) => id === 'u1' || id === 'admin').map((id) => ({ id, name: id === 'u1' ? 'Asha' : 'Arjit', employeeCode: id === 'u1' ? 'MR001' : 'EMP01' })) },
  );
  return { report, calls };
}

describe('the Orders report', () => {
  it('lists a month of orders by order date with the MR and outlet named, and adds up each status', async () => {
    const { report, calls } = kit([
      order({ id: 'a', status: 'DONE', totalAmountPaise: 300_000, completedAt: new Date('2026-10-09T05:00:00Z') }),
      order({ id: 'b', status: 'PLACED', totalAmountPaise: 100_000 }),
      order({ id: 'c', status: 'CANCELLED', totalAmountPaise: 50_000 }),
      order({ id: 'old', orderDate: '2026-09-30', status: 'DONE' }), // another month
      order({ id: 'new', orderDate: '2026-11-01', status: 'DONE' }),
    ]);
    const r = await report.month({ month: '2026-10' });
    expect(calls[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-31', limit: ORDERS_LIMIT });
    expect(r.rows.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
    expect(r.rows.find((x) => x.id === 'a')).toMatchObject({ outlet: { name: 'Shree Distributors' }, mr: { name: 'Asha', employeeCode: 'MR001' }, itemCount: 1, completedAt: '2026-10-09T05:00:00.000Z' });
    expect(r.totals).toEqual({ done: { count: 1, amountPaise: 300_000 }, placed: { count: 1, amountPaise: 100_000 }, cancelled: { count: 1, amountPaise: 50_000 } });
    expect(r.truncated).toBe(false);
  });

  it('separates distributor orders from chemist orders, and narrows by status and MR', async () => {
    const { report } = kit([
      order({ id: 'a', status: 'DONE' }),
      order({ id: 'b', outlet: { type: 'CHEMIST', id: 'c1' }, status: 'DONE' }),
      order({ id: 'c', userId: 'someone-else', status: 'PLACED' }),
    ]);
    expect((await report.month({ month: '2026-10', type: 'CHEMIST' })).rows.map((x) => [x.id, x.outlet.name])).toEqual([['b', 'Sai Medical']]);
    expect((await report.month({ month: '2026-10', type: 'DISTRIBUTOR' })).rows.map((x) => x.id).sort()).toEqual(['a', 'c']);
    expect((await report.month({ month: '2026-10', status: 'DONE' })).rows).toHaveLength(2);
    expect((await report.month({ month: '2026-10', mrId: 'u1' })).rows.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('a removed MR or outlet shows as removed, never blank; an empty month is an empty report', async () => {
    const { report } = kit([order({ id: 'a', userId: 'gone', outlet: { type: 'DISTRIBUTOR', id: 'dx' } })]);
    expect((await report.month({ month: '2026-10' })).rows[0]).toMatchObject({ outlet: { name: '(removed)' }, mr: { name: '(removed)' } });
    expect(await report.month({ month: '2026-01' })).toMatchObject({ rows: [], totals: { done: { count: 0 } }, truncated: false });
  });

  it('says so when the list may be cut short', async () => {
    const many = Array.from({ length: ORDERS_LIMIT }, (_, i) => order({ id: `o${i}` }));
    expect((await kit(many).report.month({ month: '2026-10' })).truncated).toBe(true);
  });

  it('shows one order in full, with product names and who finished it', async () => {
    const { report } = kit([order({ id: 'a', status: 'DONE', completedBy: 'admin', completedAt: new Date('2026-10-09T05:00:00Z') })]);
    expect(await report.detail('a')).toMatchObject({
      id: 'a',
      items: [{ productName: 'XYZ-500', sku: 'XYZ-500', quantity: 10, unitPricePaise: 10_000, amountPaise: 100_000 }],
      completedBy: { name: 'Arjit' },
    });
    await expect(report.detail('nope')).rejects.toMatchObject({ statusCode: 404 });
  });
});
