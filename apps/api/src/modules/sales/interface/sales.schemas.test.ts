import { describe, expect, it } from 'vitest';
import { completeOrderBodySchema, editOrderBodySchema, placeOrderBodySchema, placeOrderForBodySchema, recordPaymentBodySchema } from './sales.schemas.js';

const id = (n: number) => n.toString(16).padStart(24, '0');
const line = (over: Record<string, unknown> = {}) => ({ productId: id(1), quantity: 5, unitPricePaise: 1000, ...over });
const body = (lines: unknown[]) => ({ outletType: 'DISTRIBUTOR', outletId: id(9), lines });
const pct = (percent: number) => ({ type: 'PERCENT', percent });

describe('order line uniqueness', () => {
  it('an employee’s own order (and a synced one) keeps one line per product', () => {
    expect(placeOrderBodySchema.safeParse(body([line(), line({ discount: pct(5) })])).success).toBe(false);
    expect(placeOrderBodySchema.safeParse(body([line(), line({ productId: id(2) })])).success).toBe(true);
  });

  it('the office may split a product across lines with different discounts or prices, but not repeat a line', () => {
    const forEmployee = (lines: unknown[]) => placeOrderForBodySchema.safeParse({ ...body(lines), userId: id(3) }).success;
    expect(forEmployee([line({ discount: pct(5) }), line({ discount: pct(10) })])).toBe(true);
    expect(forEmployee([line(), line({ unitPricePaise: 900 })])).toBe(true);
    expect(forEmployee([line({ discount: pct(5) }), line({ discount: pct(5) })])).toBe(false);
    expect(editOrderBodySchema.safeParse({ lines: [line({ discount: pct(5) }), line({ discount: pct(10) })] }).success).toBe(true);
    expect(editOrderBodySchema.safeParse({ lines: [line(), line()] }).success).toBe(false);
  });

  it('a supply names each line once, by position or by product', () => {
    const supply = (s: unknown[]) => completeOrderBodySchema.safeParse({ invoiceNumber: '3452', supply: s }).success;
    expect(supply([{ productId: id(1), line: 0, suppliedQty: 1 }, { productId: id(1), line: 1, suppliedQty: 2 }])).toBe(true);
    expect(supply([{ productId: id(1), line: 0, suppliedQty: 1 }, { productId: id(1), line: 0, suppliedQty: 2 }])).toBe(false);
    expect(supply([{ productId: id(1), suppliedQty: 1 }, { productId: id(1), suppliedQty: 2 }])).toBe(false);
    const withBatch = (b: Record<string, unknown>) => supply([{ productId: id(1), suppliedQty: 1, ...b }]);
    expect(withBatch({ batchNo: 'NHN26J284', expiry: '2028-03' })).toBe(true);
    for (const bad of [{ expiry: '2028-13' }, { expiry: '03/2028' }, { expiry: '2028-3' }, { batchNo: '' }, { batchNo: 'x'.repeat(31) }]) expect(withBatch(bad)).toBe(false);
  });

  it('marking Done needs a trimmed invoice number of at most 30 characters; the supply is optional', () => {
    expect(completeOrderBodySchema.safeParse({}).success).toBe(false);
    expect(completeOrderBodySchema.safeParse({ invoiceNumber: '   ' }).success).toBe(false);
    expect(completeOrderBodySchema.safeParse({ invoiceNumber: 'x'.repeat(31) }).success).toBe(false);
    expect(completeOrderBodySchema.parse({ invoiceNumber: ' 3452 ' }).invoiceNumber).toBe('3452');
  });

  it('a payment may carry invoice allocations of whole paise above zero', () => {
    const pay = (allocations: unknown) => recordPaymentBodySchema.safeParse({ distributorId: id(9), paymentDate: '2026-10-26', amountPaise: 5000, mode: 'UPI', allocations }).success;
    expect(pay(undefined)).toBe(true);
    expect(pay([{ orderId: id(1), amountPaise: 2000 }, { orderId: id(2), amountPaise: 3000 }])).toBe(true);
    expect(pay([{ orderId: id(1), amountPaise: 0 }])).toBe(false);
    expect(pay([{ orderId: 'nope', amountPaise: 10 }])).toBe(false);
  });
});
