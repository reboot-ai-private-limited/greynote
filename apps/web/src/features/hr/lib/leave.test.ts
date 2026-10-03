import { describe, expect, it } from 'vitest';
import { daysLabel, leaveRangeLabel } from './leave';

describe('leaveRangeLabel', () => {
  it('shows one day, and a half day with which half', () => {
    expect(leaveRangeLabel('2026-10-03', '2026-10-03', null)).toBe('3 Oct 2026');
    expect(leaveRangeLabel('2026-10-03', '2026-10-03', 'FIRST')).toBe('3 Oct 2026 (first half)');
    expect(leaveRangeLabel('2026-10-03', '2026-10-03', 'SECOND')).toBe('3 Oct 2026 (second half)');
  });
  it('compresses a range inside one month', () => {
    expect(leaveRangeLabel('2026-10-03', '2026-10-05', null)).toBe('3 – 5 Oct 2026');
  });
  it('spells out a range that crosses a month or a year', () => {
    expect(leaveRangeLabel('2026-10-30', '2026-11-02', null)).toBe('30 Oct 2026 – 2 Nov 2026');
    expect(leaveRangeLabel('2026-12-30', '2027-01-02', null)).toBe('30 Dec 2026 – 2 Jan 2027');
  });
});

describe('daysLabel', () => {
  it('uses the singular for exactly one', () => {
    expect(daysLabel(1)).toBe('1 day');
    expect(daysLabel(0.5)).toBe('0.5 days');
    expect(daysLabel(3)).toBe('3 days');
  });
});
