import { describe, expect, it } from 'vitest';
import { buildEdit, buildNewOrder, defaultPricePaise, emptyOrder, lineAmountPaise, linesOf, totalPaise } from './orderForm';

const filled = () => ({
  ...emptyOrder('2026-10-14'),
  userId: 'u1',
  outletId: 'd1',
  lines: [{ productId: 'p1', quantity: '3', price: '12.50' }, { productId: 'p2', quantity: '10', price: '0.99' }],
});

describe('order form', () => {
  it('prices a distributor line at PTS and a chemist line at PTR', () => {
    const product = { ptsPaise: 1000, ptrPaise: 1200 };
    expect(defaultPricePaise('DISTRIBUTOR', product)).toBe(1000);
    expect(defaultPricePaise('CHEMIST', product)).toBe(1200);
  });

  it('works out each line and the total in paise', () => {
    expect(lineAmountPaise({ productId: 'p1', quantity: '3', price: '12.50' })).toBe(3750);
    expect(lineAmountPaise({ productId: 'p1', quantity: 'x', price: '12.50' })).toBeNull();
    expect(totalPaise(filled().lines)).toBe(3750 + 990);
  });

  it('builds a new order, with nothing in the body that the server works out', () => {
    expect(buildNewOrder(filled(), '2026-10-14')).toEqual({
      ok: true,
      body: { userId: 'u1', outletType: 'DISTRIBUTOR', outletId: 'd1', orderDate: '2026-10-14', remarks: null, lines: [{ productId: 'p1', quantity: 3, unitPricePaise: 1250 }, { productId: 'p2', quantity: 10, unitPricePaise: 99 }] },
    });
  });

  it('refuses a missing employee or outlet, a future date, a bad quantity or price, and a product twice', () => {
    const bad = { ...emptyOrder('2026-10-14'), orderDate: '2026-10-15', lines: [{ productId: 'p1', quantity: '0', price: '1' }, { productId: 'p1', quantity: '1', price: 'x' }] };
    const r = buildNewOrder(bad, '2026-10-14');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['line0', 'line1', 'orderDate', 'outletId', 'userId']);
  });

  it('builds an edit from the lines and remarks, and starts from the order as it stands', () => {
    const lines = linesOf([{ productId: 'p1', quantity: 2, unitPricePaise: 1000 }]);
    expect(lines).toEqual([{ productId: 'p1', quantity: '2', price: '10.00' }]);
    expect(buildEdit({ remarks: '  fixed ', lines })).toEqual({ ok: true, body: { remarks: 'fixed', lines: [{ productId: 'p1', quantity: 2, unitPricePaise: 1000 }] } });
    expect(buildEdit({ remarks: '', lines: [] }).ok).toBe(false);
  });
});
