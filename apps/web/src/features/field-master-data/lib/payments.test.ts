import { describe, expect, it } from 'vitest';
import type { InvoiceRowDto } from '@greynote/contracts';
import { allocatedPaise, autoAllocate, buildPayment, collectedPercent, emptyPayment, openInvoices, paymentRange } from './payments';

const today = '2026-10-09';
const filled = {
  ...emptyPayment(today),
  amount: '12,500'.replace(',', ''),
  mode: 'UPI' as const,
  reference: ' UTR 1 ',
  note: '',
};

describe('buildPayment', () => {
  it('builds the body in paise, trimming and turning empty text into null', () => {
    expect(buildPayment('d1', filled, today)).toEqual({
      ok: true,
      body: {
        distributorId: 'd1',
        paymentDate: today,
        amountPaise: 1_250_000,
        mode: 'UPI',
        reference: 'UTR 1',
        note: null,
      },
    });
  });
  it('reports every problem at once', () => {
    const result = buildPayment('d1', { ...emptyPayment(today), paymentDate: '2026-10-10' }, today);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(['amount', 'mode', 'paymentDate']);
  });
  it('refuses zero and a malformed amount, and accepts paise', () => {
    expect(buildPayment('d1', { ...filled, amount: '0' }, today).ok).toBe(false);
    expect(buildPayment('d1', { ...filled, amount: 'ten' }, today).ok).toBe(false);
    expect(buildPayment('d1', { ...filled, amount: '99.5' }, today)).toMatchObject({
      ok: true,
      body: { amountPaise: 9950 },
    });
  });
});

const inv = (orderId: string, invoiceDate: string, duePaise: number, invoiceNumber = orderId): InvoiceRowDto => ({
  orderId,
  invoiceNumber,
  invoiceDate,
  distributor: { id: 'd1', name: 'Uma Medical Store' },
  totalPaise: duePaise,
  paidPaise: 0,
  duePaise,
  status: 'UNPAID',
});

describe('payment allocations', () => {
  const invoices = [inv('b', '2026-10-05', 20_000_00, '3453'), inv('a', '2026-10-01', 25_906_00, '3452'), inv('c', '2026-09-01', 0, '3400')];

  it('lists only invoices with something due, oldest first', () => {
    expect(openInvoices(invoices).map((i) => i.invoiceNumber)).toEqual(['3452', '3453']);
  });

  it('spreads the amount oldest first, each up to its due, the rest staying on account', () => {
    expect(autoAllocate(30_000_00, invoices)).toEqual({ a: '25906.00', b: '4094.00' });
    expect(autoAllocate(10_000_00, invoices)).toEqual({ a: '10000.00' });
    expect(autoAllocate(99_999_00, invoices)).toEqual({ a: '25906.00', b: '20000.00' });
    expect(allocatedPaise({ a: '25906.00', b: '4094.00', c: 'x' })).toBe(30_000_00);
  });

  it('sends the typed amounts against each invoice and leaves blanks out', () => {
    const draft = { ...filled, amount: '30000', allocations: { a: '25906', b: '', c: '' } };
    expect(buildPayment('d1', draft, today, invoices)).toMatchObject({ ok: true, body: { amountPaise: 30_000_00, allocations: [{ orderId: 'a', amountPaise: 25_906_00 }] } });
    expect(buildPayment('d1', filled, today, invoices)).toMatchObject({ ok: true });
    expect(buildPayment('d1', filled, today, invoices)).not.toHaveProperty('body.allocations');
  });

  it('refuses more than the payment, more than is due, and a bad amount', () => {
    const over = buildPayment('d1', { ...filled, amount: '1000', allocations: { a: '1000.01' } }, today, invoices);
    expect(over).toMatchObject({ ok: false, errors: { allocations: expect.stringMatching(/more than the payment/) } });
    const due = buildPayment('d1', { ...filled, amount: '90000', allocations: { b: '20000.01' } }, today, invoices);
    expect(due).toMatchObject({ ok: false, errors: { allocations: expect.stringMatching(/Invoice 3453: only 20000.00 is due/) } });
    expect(buildPayment('d1', { ...filled, amount: '90000', allocations: { a: 'ten' } }, today, invoices).ok).toBe(false);
    expect(buildPayment('d1', { ...filled, amount: '90000', allocations: { a: '0' } }, today, invoices).ok).toBe(false);
  });
});

describe('paymentRange', () => {
  const fy = { from: '2026-04-01', to: '2027-03-31' };
  it('this month runs from the 1st to today, the year from April to today', () => {
    expect(paymentRange('month', today, fy)).toEqual({ from: '2026-10-01', to: today });
    expect(paymentRange('year', today, fy)).toEqual({ from: '2026-04-01', to: today });
  });
  it('a past year in view is shown to its end', () => {
    const past = { from: '2025-04-01', to: '2026-03-31' };
    expect(paymentRange('year', today, past)).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(paymentRange('month', today, past)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
  });
});

describe('collectedPercent', () => {
  it('is null with nothing ordered, and may pass 100', () => {
    expect(collectedPercent(5, 0)).toBeNull();
    expect(collectedPercent(50, 200)).toBe(25);
    expect(collectedPercent(300, 200)).toBe(150);
  });
});
