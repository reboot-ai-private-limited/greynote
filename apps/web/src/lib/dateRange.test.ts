import { describe, expect, it } from 'vitest';
import { isRealDate, monthToDate, rangeError } from './dateRange';

describe('isRealDate', () => {
  it('accepts a real calendar day and refuses one that does not exist or is malformed', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('26-1-1')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
});

describe('rangeError', () => {
  it('accepts a range of up to 400 days, ends included', () => {
    expect(rangeError('2026-04-01', '2026-04-01')).toBeUndefined();
    expect(rangeError('2026-01-01', '2027-02-05')).toBeUndefined();
  });
  it('refuses a reversed range, a missing end and one over 400 days', () => {
    expect(rangeError('2026-05-01', '2026-04-01')).toBe('The end date is before the start date.');
    expect(rangeError('2026-04-01', '')).toBe('Choose both dates.');
    expect(rangeError('2026-01-01', '2027-02-06')).toBe('Choose at most 400 days at a time.');
  });
});

describe('monthToDate', () => {
  it('runs from the first of the month to the given day', () => {
    expect(monthToDate('2026-10-03')).toEqual({ from: '2026-10-01', to: '2026-10-03' });
    expect(monthToDate('2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  });
});
