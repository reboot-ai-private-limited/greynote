import { describe, expect, it } from 'vitest';
import { MAX_DAYS, daysError, formatDays, parseDays } from './days';

describe('daysError', () => {
  it('accepts whole and half days from 0 to 366', () => {
    for (const ok of ['0', '12', ' 12.5 ', '0.5', String(MAX_DAYS)]) expect(daysError(ok)).toBeUndefined();
  });
  it('refuses blank, text, negatives and fractions that are not halves', () => {
    expect(daysError('')).toBe('Enter a number of days.');
    expect(daysError('ten')).toMatch(/Use a number/);
    expect(daysError('-1')).toMatch(/Use a number/);
    expect(daysError('1.25')).toBe('Use whole or half days only.');
    expect(daysError('12,5')).toMatch(/Use a number/);
  });
  it('refuses more than a year', () => {
    expect(daysError('366.5')).toMatch(/at most 366/);
    expect(daysError('367')).toMatch(/at most 366/);
  });
  it('can refuse zero where a leave must be at least something', () => {
    expect(daysError('0', { allowZero: false })).toBe('Use at least half a day.');
    expect(daysError('0.5', { allowZero: false })).toBeUndefined();
  });
});

describe('parseDays / formatDays', () => {
  it('parses a valid entry and gives null for an invalid one', () => {
    expect(parseDays(' 12.5 ')).toBe(12.5);
    expect(parseDays('1.3')).toBeNull();
  });
  it('shows whole days without a decimal and halves with one', () => {
    expect(formatDays(12)).toBe('12');
    expect(formatDays(12.5)).toBe('12.5');
    expect(formatDays(0)).toBe('0');
  });
});
