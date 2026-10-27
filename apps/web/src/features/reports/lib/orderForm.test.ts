import { describe, expect, it } from 'vitest';
import { buildSupply, deliveredPaise, notSupplied, supplyDraftOf, buildEdit, buildNewOrder, defaultPricePaise, emptyOrder, lineAmountPaise, linesOf, totalPaise, previewNet } from './orderForm';

const filled = () => ({
  ...emptyOrder('2026-10-14'),
  userId: 'u1',
  outletId: 'd1',
  lines: [
    {
      key: 'k1',
      productId: 'p1',
      quantity: '3',
      price: '12.50',
      free: '',
      discKind: '' as const,
      discValue: '',
    },
    {
      key: 'k2',
      productId: 'p2',
      quantity: '10',
      price: '0.99',
      free: '1',
      discKind: '' as const,
      discValue: '',
    },
  ],
});

describe('order form', () => {
  it('prices a distributor line at PTS and a chemist line at PTR', () => {
    const product = { ptsPaise: 1000, ptrPaise: 1200 };
    expect(defaultPricePaise('DISTRIBUTOR', product)).toBe(1000);
    expect(defaultPricePaise('CHEMIST', product)).toBe(1200);
  });

  it('works out each line and the total in paise', () => {
    expect(
      lineAmountPaise({
        key: 'k3',
        productId: 'p1',
        quantity: '3',
        price: '12.50',
        free: '',
        discKind: '',
        discValue: '',
      }),
    ).toBe(3750);
    expect(
      lineAmountPaise({
        key: 'k4',
        productId: 'p1',
        quantity: 'x',
        price: '12.50',
        free: '',
        discKind: '',
        discValue: '',
      }),
    ).toBeNull();
    expect(totalPaise(filled().lines)).toBe(3750 + 990);
  });

  it('builds a new order, with nothing in the body that the server works out', () => {
    expect(buildNewOrder(filled(), '2026-10-14')).toEqual({
      ok: true,
      body: {
        userId: 'u1',
        outletType: 'DISTRIBUTOR',
        outletId: 'd1',
        orderDate: '2026-10-14',
        remarks: null,
        lines: [
          { productId: 'p1', quantity: 3, unitPricePaise: 1250, freeQty: 0 },
          { productId: 'p2', quantity: 10, unitPricePaise: 99, freeQty: 1 },
        ],
      },
    });
  });

  it('refuses a missing employee or outlet, a future date, a bad quantity or price, and a product twice', () => {
    const bad = {
      ...emptyOrder('2026-10-14'),
      orderDate: '2026-10-15',
      lines: [
        { key: 'k5', productId: 'p1', quantity: '0', price: '1', free: '', discKind: '' as const, discValue: '' },
        { key: 'k6', productId: 'p1', quantity: '1', price: 'x', free: '', discKind: '' as const, discValue: '' },
      ],
    };
    const r = buildNewOrder(bad, '2026-10-14');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['line0', 'line1', 'orderDate', 'outletId', 'userId']);
  });

  it('builds an edit from the lines and remarks, and starts from the order as it stands', () => {
    const lines = linesOf([{ productId: 'p1', quantity: 2, unitPricePaise: 1000 }]);
    expect(lines).toEqual([{ key: expect.any(String), productId: 'p1', quantity: '2', price: '10.00', free: '', discKind: '', discValue: '' }]);
    expect(buildEdit({ remarks: '  fixed ', lines, discKind: '', discValue: '' })).toEqual({
      ok: true,
      body: {
        remarks: 'fixed',
        lines: [{ productId: 'p1', quantity: 2, unitPricePaise: 1000, freeQty: 0 }],
      },
    });
    expect(buildEdit({ remarks: '', lines: [], discKind: '', discValue: '' }).ok).toBe(false);
  });

  it('Mark Done starts as a full supply; a part supply and free units build the body, and the delivered amount leaves free units out', () => {
    const drafts = supplyDraftOf([
      { productId: 'p1', quantity: 12, unitPricePaise: 1000 },
      { productId: 'p2', quantity: 5, unitPricePaise: 100 },
    ]);
    expect(buildSupply(drafts, ' 3452 ')).toEqual({
      ok: true,
      body: {
        invoiceNumber: '3452',
        supply: [
          { productId: 'p1', line: 0, suppliedQty: 12, freeQty: 0 },
          { productId: 'p2', line: 1, suppliedQty: 5, freeQty: 0 },
        ],
      },
    });
    const part = [{ ...drafts[0]!, supplied: '10', free: '2', discKind: '', discValue: '' }, drafts[1]!];
    expect(notSupplied(part[0]!)).toBe(2);
    expect(deliveredPaise(part)).toBe(10 * 1000 + 5 * 100);
    expect(buildSupply(part, 'A-1')).toMatchObject({
      ok: true,
      body: {
        supply: [
          { productId: 'p1', line: 0, suppliedQty: 10, freeQty: 2 },
          { productId: 'p2', line: 1, suppliedQty: 5, freeQty: 0 },
        ],
      },
    });
  });

  it('one product can sit on two lines at different discounts or prices, but not twice at the same ones; supply goes out per line', () => {
    const base = linesOf([{ productId: 'p1', quantity: 6, unitPricePaise: 1000 }]);
    const second = (over: Partial<(typeof base)[number]>) => [...base, { ...base[0]!, key: 'other', quantity: '4', ...over }];
    expect(buildEdit({ remarks: '', lines: second({ discKind: 'PERCENT', discValue: '10' }), discKind: '', discValue: '' }).ok).toBe(true);
    expect(buildEdit({ remarks: '', lines: second({ price: '9' }), discKind: '', discValue: '' }).ok).toBe(true);
    expect(buildEdit({ remarks: '', lines: second({}), discKind: '', discValue: '' })).toMatchObject({ ok: false, errors: { line1: expect.stringMatching(/same price and discount/) } });
    const drafts = supplyDraftOf([{ productId: 'p1', quantity: 6, unitPricePaise: 1000 }, { productId: 'p1', quantity: 4, unitPricePaise: 1000 }]);
    expect(buildSupply(drafts, '1')).toMatchObject({ ok: true, body: { supply: [{ productId: 'p1', line: 0 }, { productId: 'p1', line: 1 }] } });
  });

  it('refuses a supply above the order, or a free figure that is not a whole number', () => {
    const [d] = supplyDraftOf([{ productId: 'p1', quantity: 4, unitPricePaise: 1000 }]);
    expect(buildSupply([{ ...d!, supplied: '5' }], '1').ok).toBe(false);
    expect(buildSupply([{ ...d!, free: '1.5' }], '1').ok).toBe(false);
    expect(notSupplied({ ...d!, supplied: '5' })).toBeNull();
  });

  it('Mark Done needs an invoice number: blank is refused, and so is one over 30 characters', () => {
    const drafts = supplyDraftOf([{ productId: 'p1', quantity: 4, unitPricePaise: 1000 }]);
    expect(buildSupply(drafts, '   ')).toMatchObject({ ok: false, errors: { invoiceNumber: 'Enter the invoice number.' } });
    expect(buildSupply(drafts, 'x'.repeat(31))).toMatchObject({ ok: false, errors: { invoiceNumber: expect.stringMatching(/at most 30/i) } });
    expect(buildSupply(drafts, 'x'.repeat(30)).ok).toBe(true);
  });

  it('works out line and order discounts the way the server does, and builds them into the body', () => {
    const lines = [
      {
        key: 'k7',
        productId: 'p1',
        quantity: '10',
        price: '100',
        free: '',
        discKind: 'PERCENT' as const,
        discValue: '10',
      },
      {
        key: 'k8',
        productId: 'p2',
        quantity: '5',
        price: '100',
        free: '',
        discKind: '' as const,
        discValue: '',
      },
    ];
    // ₹1000 − 10% = ₹900 and ₹500: subtotal ₹1400; a flat ₹14 off the order is shared 9 / 5 by size.
    const net = previewNet(lines, { discKind: 'FIXED', discValue: '14' });
    expect(net.lines).toEqual([89100, 49500]);
    expect(net.orderDiscountPaise).toBe(1400);
    expect(net.totalPaise).toBe(138600);
    const built = buildEdit({ remarks: '', lines, discKind: 'PERCENT', discValue: '2.5' });
    expect(built).toEqual({
      ok: true,
      body: {
        remarks: null,
        lines: [
          {
            productId: 'p1',
            quantity: 10,
            unitPricePaise: 10000,
            freeQty: 0,
            discount: { type: 'PERCENT', percent: 10 },
          },
          { productId: 'p2', quantity: 5, unitPricePaise: 10000, freeQty: 0 },
        ],
        discount: { type: 'PERCENT', percent: 2.5 },
      },
    });
    expect(buildEdit({ remarks: '', lines, discKind: 'PERCENT', discValue: '101' }).ok).toBe(false);
    expect(buildEdit({ remarks: '', lines, discKind: 'FIXED', discValue: '5000' }).ok).toBe(false);
  });
});
