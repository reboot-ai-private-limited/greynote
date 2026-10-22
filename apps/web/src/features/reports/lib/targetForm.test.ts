import { describe, expect, it } from 'vitest';
import { ALL_PRODUCTS, buildTargetBody, targetDraft } from './targetForm';

const months = ['2026-04', '2026-05', '2026-10', '2026-11', '2027-03'];

describe('targetDraft', () => {
  it('starts a new target on the months in view, for all products', () => {
    expect(targetDraft(months, { from: '2026-10', to: '2026-11' })).toEqual({ productId: ALL_PRODUCTS, fromMonth: '2026-10', toMonth: '2026-11', amount: '', units: '' });
    expect(targetDraft(months, { from: '2025-01', to: '2025-02' })).toMatchObject({ fromMonth: '2026-04', toMonth: '2026-04' });
  });
  it('starts an edit from the target as it is', () => {
    const target = { id: 't1', product: { id: 'p1', name: 'Cough Syrup' }, fromMonth: '2026-10', toMonth: '2026-12', amountPaise: 1_250_050, achievedPaise: 0, achievementPercent: null, targetQty: 40, achievedQty: 0, achievementQtyPercent: null };
    expect(targetDraft(months, { from: '2026-04', to: '2026-04' }, target)).toEqual({ productId: 'p1', fromMonth: '2026-10', toMonth: '2026-12', amount: '12500.50', units: '40' });
    expect(targetDraft(months, { from: '2026-04', to: '2026-04' }, { ...target, product: null, targetQty: null })).toMatchObject({ productId: ALL_PRODUCTS, units: '' });
  });
});

describe('buildTargetBody', () => {
  const draft = { productId: ALL_PRODUCTS, fromMonth: '2026-10', toMonth: '2026-12', amount: '5000', units: '' };
  it('sends all products as an amount in paise', () => {
    expect(buildTargetBody(draft, null)).toEqual({ ok: true, body: { month: '2026-10', toMonth: '2026-12', productId: null, targetAmountPaise: 500_000 } });
  });
  it('sends a product with a PTS and whole units as units, else as the amount', () => {
    expect(buildTargetBody({ ...draft, productId: 'p1', units: '40' }, 1200)).toMatchObject({ body: { productId: 'p1', targetQty: 40 } });
    expect(buildTargetBody({ ...draft, productId: 'p1', units: '' }, 1200)).toMatchObject({ body: { productId: 'p1', targetAmountPaise: 500_000 } });
    expect(buildTargetBody({ ...draft, productId: 'p1', units: '40' }, null)).toMatchObject({ body: { targetAmountPaise: 500_000 } });
  });
  it('refuses no amount and months the wrong way round', () => {
    expect(buildTargetBody({ ...draft, amount: '' }, null)).toEqual({ ok: false, errors: { amount: 'Enter an amount in rupees, more than zero.' } });
    expect(buildTargetBody({ ...draft, toMonth: '2026-05' }, null)).toEqual({ ok: false, errors: { months: 'The last month cannot be before the first.' } });
  });
});
