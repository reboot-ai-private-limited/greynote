import { describe, expect, it } from 'vitest';
import { buildPayment, collectedPercent, emptyPayment, paymentRange } from './payments';

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
