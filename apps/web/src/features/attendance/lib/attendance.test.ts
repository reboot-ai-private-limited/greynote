import { describe, expect, it } from 'vitest';
import { deductionNote, leadingBlanks, monthsInYear, zipDays } from './attendance';

describe('leadingBlanks', () => {
  it('counts the columns before the 1st with Monday first', () => {
    expect(leadingBlanks('2026-10-01')).toBe(3); // a Thursday
    expect(leadingBlanks('2026-06-01')).toBe(0); // a Monday
    expect(leadingBlanks('2026-02-01')).toBe(6); // a Sunday
  });
});

describe('zipDays', () => {
  it('pairs each date with its status', () => {
    expect(zipDays(['2026-10-01', '2026-10-02'], ['PRESENT', 'ABSENT'])).toEqual([
      { date: '2026-10-01', status: 'PRESENT' },
      { date: '2026-10-02', status: 'ABSENT' },
    ]);
    expect(zipDays([], [])).toEqual([]);
  });
});

describe('monthsInYear', () => {
  it('lists the year\'s months up to and including the current one, newest first', () => {
    expect(monthsInYear(2026, '2026-10-07')).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
  });
  it('the first month of a year shows just that month; a past year shows all twelve', () => {
    expect(monthsInYear(2026, '2026-04-01')).toEqual(['2026-04']);
    expect(monthsInYear(2025, '2026-10-07')).toHaveLength(12);
    expect(monthsInYear(2025, '2026-10-07')[0]).toBe('2026-03');
  });
});

describe('deductionNote', () => {
  it('says what would be deducted, or why nothing would', () => {
    expect(deductionNote({ deductibleDays: 3, absentDays: 3, absentDeducts: true })).toMatch(/^3 days would be deducted/);
    expect(deductionNote({ deductibleDays: 1, absentDays: 1, absentDeducts: true })).toMatch(/^1 day would be deducted/);
    expect(deductionNote({ deductibleDays: 0, absentDays: 0, absentDeducts: true })).toMatch(/Nothing would be deducted/);
    expect(deductionNote({ deductibleDays: 0, absentDays: 2, absentDeducts: false })).toMatch(/2 absent days, not deducted/);
  });
});
