import { describe, expect, it } from 'vitest';
import { adjustPreview, adjustReasonError, allocationError, allocationFloor } from './balances';

const balance = { usedDays: 4, pendingDays: 2.5 };

describe('allocationError', () => {
  it('allows an allocation equal to used plus pending, and above', () => {
    expect(allocationFloor(balance)).toBe(6.5);
    expect(allocationError('6.5', balance)).toBeUndefined();
    expect(allocationError('15', balance)).toBeUndefined();
  });
  it('refuses one below what is used or waiting, and says how much', () => {
    expect(allocationError('6', balance)).toBe('6.5 days are already used or waiting for approval, so the allocation cannot be lower.');
    expect(allocationError('0', { usedDays: 1, pendingDays: 0 })).toMatch(/1 day is already used/);
  });
  it('applies the whole-or-half-day rule first', () => {
    expect(allocationError('', balance)).toBe('Enter a number of days.');
    expect(allocationError('7.3', balance)).toBe('Use whole or half days only.');
    expect(allocationError('400', balance)).toMatch(/at most 366/);
  });
  it('allows zero when nothing is used', () => {
    expect(allocationError('0', { usedDays: 0, pendingDays: 0 })).toBeUndefined();
  });
});

describe('adjustReasonError', () => {
  it('requires a reason and caps it', () => {
    expect(adjustReasonError('  ')).toBe('A reason is required.');
    expect(adjustReasonError('One-off top-up')).toBeUndefined();
    expect(adjustReasonError('x'.repeat(501))).toMatch(/500/);
  });
});

describe('adjustPreview', () => {
  it('shows the change and its size', () => {
    expect(adjustPreview(12, 15)).toBe('12 → 15 days (+3)');
    expect(adjustPreview(12, 9.5)).toBe('12 → 9.5 days (−2.5)');
    expect(adjustPreview(12, 12)).toBe('12 → 12 days (±0)');
  });
});
