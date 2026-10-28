import { describe, expect, it } from 'vitest';
import { planDelete } from './deleteOrders.js';

describe('planDelete', () => {
  it('separates orders that exist from those that do not, and lists payments allocated to them', () => {
    const plan = planDelete(['a', 'b', 'x'], [{ _id: 'a' }, { _id: 'b' }], [{ _id: 'p1', allocations: [{ orderId: 'a', amountPaise: 500 }, { orderId: 'z', amountPaise: 9 }] }, { _id: 'p2' }]);
    expect(plan).toEqual({ missing: ['x'], orderIds: ['a', 'b'], allocatedPayments: [{ paymentId: 'p1', amountPaise: 500 }] });
  });
});
