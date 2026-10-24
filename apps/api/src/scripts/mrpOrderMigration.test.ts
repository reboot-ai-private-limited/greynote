import { describe, expect, it } from 'vitest';
import { planOrder, type OrderDoc } from './mrpOrderMigration.js';

const products = new Map([['p1', { ptsPaise: 79_400, ptrPaise: 88_300, mrpPaise: 115_900 }]]);
const line = { productId: 'p1', quantity: 30, unitPricePaise: 115_900, amountPaise: 3_477_000 };
const placed = (over: Partial<OrderDoc> = {}): OrderDoc => ({ status: 'PLACED', distributorId: 'd1', totalAmountPaise: 3_477_000, items: [{ ...line, netAmountPaise: 3_477_000 }], ...over });

describe('planOrder', () => {
  it('reprices a distributor line at the MRP to PTS, keeping the first copy', () => {
    const patch = planOrder(placed(), products)!;
    expect(patch).toMatchObject({ totalBefore: 3_477_000, totalAfter: 2_382_000, changes: [{ productId: 'p1', from: 115_900, to: 79_400 }] });
    expect(patch.set).toMatchObject({ totalAmountPaise: 2_382_000, originalTotalAmountPaise: 3_477_000 });
    expect((patch.set['items'] as OrderDoc['items'])[0]).toMatchObject({ unitPricePaise: 79_400, amountPaise: 2_382_000, netAmountPaise: 2_382_000 });
  });
  it('uses PTR for a chemist order and keeps an earlier original', () => {
    const patch = planOrder(placed({ distributorId: undefined, originalItems: [line] }), products)!;
    expect(patch.totalAfter).toBe(30 * 88_300);
    expect(patch.set).not.toHaveProperty('originalItems');
  });
  it('values a Done order’s supplied units and the supplied total', () => {
    const patch = planOrder(placed({ status: 'DONE', items: [{ ...line, suppliedQty: 20, netAmountPaise: 3_477_000, suppliedNetPaise: 2_318_000 }] }), products)!;
    expect((patch.set['items'] as OrderDoc['items'])[0]!.suppliedNetPaise).toBe(20 * 79_400);
    expect(patch.set['suppliedAmountPaise']).toBe(20 * 79_400);
  });
  it('shares a percent order discount into the repriced lines', () => {
    const patch = planOrder(placed({ discount: { type: 'PERCENT', percent: 10 } }), products)!;
    expect(patch.totalAfter).toBe(2_382_000 - 238_200);
  });
  it('leaves alone: a line not at the MRP, an edited order, a cancelled one, and a flat discount that no longer fits', () => {
    expect(planOrder(placed({ items: [{ ...line, unitPricePaise: 79_400, amountPaise: 2_382_000 }] }), products)).toBeNull();
    expect(planOrder(placed({ editedBy: 'acct' }), products)).toBeNull();
    expect(planOrder(placed({ status: 'CANCELLED' }), products)).toBeNull();
    expect(planOrder(placed({ items: [{ ...line, discount: { type: 'FIXED', amountPaise: 3_000_000 } }] }), products)).toBeNull();
  });
});
