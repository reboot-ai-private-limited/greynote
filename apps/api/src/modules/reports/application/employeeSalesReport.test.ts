import { describe, expect, it } from 'vitest';
import { primaryOf, secondaryOf, type PriceRow } from '../domain/employeeFigures.js';
import { EmployeeSalesReport } from './employeeSalesReport.js';

const prices = new Map<string, PriceRow>([
  ['p1', { id: 'p1', name: 'Amox', sku: 'AMX', ptrPaise: 1000, ptsPaise: 800 }],
  ['p2', { id: 'p2', name: 'Cetri', sku: 'CET', ptrPaise: null, ptsPaise: null }],
]);
const orders = [
  { userId: 'mr1', distributorId: 'd1', productId: 'p1', month: '2026-10', quantity: 10, amountPaise: 8_500 },
  { userId: 'mr1', distributorId: 'd2', productId: 'p1', month: '2026-11', quantity: 5, amountPaise: 4_000 },
  { userId: 'mr1', distributorId: 'd1', productId: 'p1', month: '2026-11', quantity: 2, amountPaise: 1_600 },
];
const entries = [
  { userId: 'mr1', productId: 'p1', month: '2026-10', secondaryQty: 20, adjustmentQty: 2 },
  { userId: 'mr1', productId: 'p1', month: '2026-11', secondaryQty: 30, adjustmentQty: 0 },
  { userId: 'mr1', productId: 'p2', month: '2026-10', secondaryQty: 7, adjustmentQty: -1 },
  { userId: 'mr2', productId: 'p1', month: '2026-10', secondaryQty: 99, adjustmentQty: 0 },
];

describe('employee figures', () => {
  it('values secondary at PTS; a product with no PTS is counted in units only', () => {
    expect(secondaryOf(entries, prices, { userId: 'mr1', fromMonth: '2026-10', toMonth: '2026-11' })).toEqual({ qty: 57, paise: 40_000, unpricedQty: 7 });
    expect(secondaryOf(entries, prices, { userId: 'mr1', productId: 'p1', fromMonth: '2026-10', toMonth: '2026-10' })).toMatchObject({ qty: 20, paise: 16_000 });
    expect(secondaryOf(entries, prices, { userId: 'mr1', productId: null, fromMonth: '2026-11', toMonth: '2026-11' }).paise).toBe(24_000);
  });

  it('primary is the Done orders at their amounts plus Admin\'s change at PTS', () => {
    expect(primaryOf(orders, entries, prices, { userId: 'mr1', productId: 'p1', fromMonth: '2026-10', toMonth: '2026-10' })).toEqual({ qty: 12, paise: 8_500 + 2 * 800, unpricedQty: 0, adjustmentQty: 2 });
    expect(primaryOf(orders, entries, prices, { userId: 'mr1', productId: 'p2', fromMonth: '2026-10', toMonth: '2026-10' })).toMatchObject({ qty: -1, paise: 0, unpricedQty: -1 });
  });
});

describe('EmployeeSalesReport', () => {
  const report = new EmployeeSalesReport(
    {
      async sumUserOrders() { return orders; },
      async listEmployeeSales() { return entries.filter((e) => e.userId === 'mr1'); },
    },
    {
      async listTargetShares() {
        return [
          { id: 't1', userId: 'mr1', productId: 'p1', fromMonth: '2026-10', toMonth: '2026-12', amountPaise: 90_000, qty: 75, sharePaise: 60_000, shareQty: 50 },
          { id: 't2', userId: 'mr1', productId: null, fromMonth: '2026-04', toMonth: '2027-03', amountPaise: 120_000, qty: null, sharePaise: 20_000, shareQty: null },
        ];
      },
    },
    { async listNames() { return { distributors: [{ id: 'd1', name: 'Shree' }, { id: 'd2', name: 'Maa Tara' }], chemists: [], products: [...prices.values()] }; }, async listAssignedDoctors() { return []; }, async listActiveOutlets() { return { distributors: [], chemists: [] }; }, async listDistributorAssignees() { return []; } },
    { async getUserSummaries() { return [{ id: 'mr1', name: 'Asha', employeeCode: 'E1' }]; } },
    { async getDownline(id) { return id === 'asm' ? [{ id: 'mr1' }] : []; }, async getDesignationLevels(ids) { return ids.map((userId) => ({ userId, level: userId === 'asm' ? 2 : 1 })); } },
    { entries: async (ids: readonly string[]) => entries.filter((e) => ids.includes(e.userId) && e.secondaryQty !== null) } as never,
  );
  const input = { userId: 'mr1', from: '2026-10', to: '2026-11' };

  it('shows each product\'s target share, primary, secondary and achievement, and each target over its own months', async () => {
    const out = await report.read({ actor: { id: 'admin', role: 'ADMIN' }, ...input });
    expect(out.products.map((p) => p.product.name)).toEqual(['Amox', 'Cetri']);
    expect(out.products[0]).toMatchObject({ targetPaise: 60_000, primaryQty: 19, secondaryQty: 50, secondaryPaise: 40_000, achievementPercent: 67, flags: [] });
    expect(out.products[1]).toMatchObject({ secondaryQty: 7, secondaryPaise: 0, flags: ['NO_PTS', 'NO_PTS_CHANGE'] });
    expect(out.generalTargetPaise).toBe(20_000);
    expect(out.totals).toMatchObject({ targetPaise: 80_000, secondaryPaise: 40_000 });
    expect(out.targets[0]).toMatchObject({ id: 't1', product: { id: 'p1', name: 'Amox' }, achievedPaise: 40_000, achievementPercent: 44 });
    expect(out.targets[1]).toMatchObject({ id: 't2', product: null, achievedPaise: 40_000 });
  });

  it('lists the employee\'s Done orders by distributor, adding up to their order primary', async () => {
    const out = await report.read({ actor: { id: 'acct', role: 'ACCOUNTANT' }, ...input });
    expect(out.distributors).toEqual([
      { distributor: { id: 'd2', name: 'Maa Tara' }, orderQty: 5, orderPaise: 4_000 },
      { distributor: { id: 'd1', name: 'Shree' }, orderQty: 12, orderPaise: 10_100 },
    ]);
  });

  it('a manager’s figures are the sum of the MRs below them; an MR’s carry no team', async () => {
    const mr = await report.read({ actor: { id: 'admin', role: 'ADMIN' }, ...input });
    expect(mr.team).toBeNull();
    const asm = await report.read({ actor: { id: 'admin', role: 'ADMIN' }, ...input, userId: 'asm' });
    expect(asm.team).toEqual({ mrCount: 1 });
    expect(asm.totals).toMatchObject({ targetPaise: 80_000, secondaryPaise: 40_000 });
    expect(asm.targets).toHaveLength(2);
  });

  it('is open to Admin, the employee and their manager, and to nobody else', async () => {
    await report.read({ actor: { id: 'mr1', role: 'FIELD' }, ...input });
    await report.read({ actor: { id: 'asm', role: 'FIELD' }, ...input });
    await expect(report.read({ actor: { id: 'mr2', role: 'FIELD' }, ...input })).rejects.toMatchObject({ statusCode: 403 });
    await expect(report.read({ actor: { id: 'admin', role: 'ADMIN' }, ...input, to: '2026-09' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
