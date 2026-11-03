import { describe, expect, it } from 'vitest';
import { defaultMonth, fyMonths, quarterMonths, quarterOf } from './salesBreakdown';

describe('financial year windows', () => {
  it('lists the twelve months of the year in order, April to March', () => {
    const months = fyMonths(2026);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2026-04');
    expect(months[11]).toBe('2027-03');
  });

  it('cuts quarters of three months and places a month in its quarter, also for a past year', () => {
    expect(quarterMonths(2026, 3)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(quarterOf(2026, '2027-02')).toBe(4);
    expect(quarterOf(2025, '2026-11')).toBe(1); // not in that year: falls back to Q1 on purpose
  });

  it('opens on this month, or on the year’s edge when this month is outside it', () => {
    expect(defaultMonth(2026, '2026-11')).toBe('2026-11');
    expect(defaultMonth(2024, '2026-11')).toBe('2025-03');
    expect(defaultMonth(2030, '2026-11')).toBe('2030-04');
  });
});
