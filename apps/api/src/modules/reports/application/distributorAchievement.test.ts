import { describe, expect, it } from 'vitest';
import { DistributorAchievement, monthsBetween } from './distributorAchievement.js';

const orderSums = [
  // d1 got 12 delivered in October: 10 supplied + 2 free (the sums already carry the delivered units)
  { month: '2026-10', distributorId: 'd1', productId: 'p1', status: 'DONE' as const, quantity: 12, amountPaise: 10_000 },
  { month: '2026-10', distributorId: 'd2', productId: 'p1', status: 'DONE' as const, quantity: 5, amountPaise: 4_000 },
  { month: '2026-10', distributorId: 'd3', productId: 'p1', status: 'DONE' as const, quantity: 99, amountPaise: 99 },
];
const stock = [
  { outlet: { type: 'DISTRIBUTOR' as const, id: 'd1' }, productId: 'p1', month: '2026-10', openingQty: 8, closingQty: 5 }, // 8 + 12 - 5 = 15 sold on
  { outlet: { type: 'DISTRIBUTOR' as const, id: 'd2' }, productId: 'p1', month: '2026-10', openingQty: 0, closingQty: 9 }, // 0 + 5 - 9 = -4: a counting error, left out
  { outlet: { type: 'DISTRIBUTOR' as const, id: 'd3' }, productId: 'p1', month: '2026-10', openingQty: 0, closingQty: 0 },
];
const sales = {
  async sumDistributorOrders() {
    return orderSums;
  },
  async listStockRange() {
    return stock;
  },
  async listStatements() {
    return [];
  },
} as never;
const master = {
  async listDistributorAssignees() {
    return [
      { id: 'd1', assignedUserIds: ['mr1'] },
      { id: 'd2', assignedUserIds: ['mr1', 'mr2'] },
      { id: 'd3', assignedUserIds: ['mr9'] },
    ];
  },
} as never;

describe('distributor achievement', () => {
  it('an employee’s secondary per product is the sum over their distributors, free units included, errors and strangers left out', async () => {
    const rows = await new DistributorAchievement(sales, master).entries(['mr1', 'mr2'], '2026-10', '2026-10');
    expect(rows).toEqual([{ userId: 'mr1', productId: 'p1', month: '2026-10', secondaryQty: 15, adjustmentQty: 0 }]);
  });

  it('nobody assigned, or no employees, is nothing', async () => {
    expect(await new DistributorAchievement(sales, master).entries(['mr7'], '2026-10', '2026-10')).toEqual([]);
    expect(await new DistributorAchievement(sales, master).entries([], '2026-10', '2026-10')).toEqual([]);
  });

  it('lists the months of a range across a new year', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});
