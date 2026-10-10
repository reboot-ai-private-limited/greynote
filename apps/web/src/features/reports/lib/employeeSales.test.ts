import type { EmployeeSalesLineDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { adjustmentOf, buildPrimary, buildSecondary, draftOf, isDirty, periodMonths, rangeLabel, rowErrors, type MonthDraft } from './employeeSales';

const FY = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
const line = (over: Partial<EmployeeSalesLineDto> = {}): EmployeeSalesLineDto => ({ product: { id: 'p1', name: 'Amox', sku: 'AMX' }, orderPrimaryQty: 20, adjustmentQty: 0, adjustmentReason: null, primaryQty: 20, secondaryQty: null, updatedBy: null, updatedAt: null, ...over });
const drafts = (d: Partial<MonthDraft>, l = line()) => new Map([[l.product.id, { ...draftOf(l), ...d }]]);

describe('periods', () => {
  it('a month, the quarter of the financial year that holds it, or the whole year', () => {
    expect(periodMonths('month', '2026-10', FY)).toEqual({ from: '2026-10', to: '2026-10' });
    expect(periodMonths('quarter', '2026-10', FY)).toEqual({ from: '2026-10', to: '2026-12' });
    expect(periodMonths('quarter', '2026-05', FY)).toEqual({ from: '2026-04', to: '2026-06' });
    expect(periodMonths('year', '2026-10', FY)).toEqual({ from: '2026-04', to: '2027-03' });
    expect(periodMonths('month', '2030-01', FY)).toEqual({ from: '2026-04', to: '2026-04' });
  });
  it('labels one month or a run', () => {
    expect(rangeLabel('2026-10', '2026-10')).toBe('October 2026');
    expect(rangeLabel('2026-10', '2026-12')).toBe('October 2026 – December 2026');
  });
});

describe('the entry grid', () => {
  it('starts from what the server has: primary total, reason, secondary', () => {
    expect(draftOf(line({ adjustmentQty: 5, primaryQty: 25, adjustmentReason: 'Direct', secondaryQty: 12 }))).toEqual({ primary: '25', reason: 'Direct', secondary: '12' });
    expect(isDirty(line(), draftOf(line()), true)).toBe(false);
  });

  it('typing a primary total means a change to the orders; it needs a reason, and only Admin can make it', () => {
    const l = line();
    const d = { ...draftOf(l), primary: '25' };
    expect(adjustmentOf(l, d)).toBe(5);
    expect(rowErrors(l, d, true)).toEqual({ reason: 'Say why.' });
    expect(rowErrors(l, { ...d, reason: 'Direct supply' }, true)).toEqual({});
    expect(rowErrors(l, d, false)).toEqual({});
    expect(isDirty(l, d, true)).toBe(true);
    expect(isDirty(l, d, false)).toBe(false);
  });

  it('refuses what is not a whole number', () => {
    const l = line();
    expect(rowErrors(l, { ...draftOf(l), secondary: '1.5' }, false).secondary).toBeTruthy();
    expect(rowErrors(l, { ...draftOf(l), primary: '-2' }, true).primary).toBeTruthy();
  });

  it('sends only the rows that changed, and nothing when none did', () => {
    const l = line({ secondaryQty: 10 });
    expect(buildSecondary('u1', '2026-10', [l], drafts({}, l))).toBeNull();
    expect(buildSecondary('u1', '2026-10', [l], drafts({ secondary: '14' }, l))).toEqual({ userId: 'u1', month: '2026-10', lines: [{ productId: 'p1', qty: 14 }] });
    expect(buildPrimary('u1', '2026-10', [l], drafts({}, l))).toBeNull();
    expect(buildPrimary('u1', '2026-10', [l], drafts({ primary: '17', reason: ' Return ' }, l))).toEqual({ userId: 'u1', month: '2026-10', lines: [{ productId: 'p1', adjustmentQty: -3, reason: 'Return' }] });
  });

  it('putting the total back to the orders clears a saved change', () => {
    const l = line({ adjustmentQty: 5, primaryQty: 25, adjustmentReason: 'Direct' });
    expect(buildPrimary('u1', '2026-10', [l], drafts({ primary: '20' }, l))).toEqual({ userId: 'u1', month: '2026-10', lines: [{ productId: 'p1', adjustmentQty: 0, reason: null }] });
  });
});
