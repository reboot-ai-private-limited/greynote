import { describe, expect, it } from 'vitest';
import { monthWindow, stockDeadline } from './stockDeadline.js';

const IST = 'Asia/Kolkata';
/** 23:59:59.999 IST on the given day, as an instant. */
const endOf = (day: string) => new Date(`${day}T23:59:59.999+05:30`);

describe('stockDeadline', () => {
  it.each([
    ['2026-09', '2026-09-30'], // 30 days
    ['2026-10', '2026-10-31'], // 31 days
    ['2026-02', '2026-02-28'], // not a leap year
    ['2028-02', '2028-02-29'], // leap year
    ['2026-12', '2026-12-31'], // year end
  ])('%s is due at the end of %s', (month, lastDay) => {
    expect(stockDeadline(month, 0, IST)).toEqual(endOf(lastDay));
  });

  it('grace days push it into the next month', () => {
    expect(stockDeadline('2026-09', 5, IST)).toEqual(endOf('2026-10-05'));
    expect(stockDeadline('2026-12', 3, IST)).toEqual(endOf('2027-01-03'));
  });
});

describe('monthWindow', () => {
  const at = (iso: string) => new Date(iso);

  it('is OPEN all through the month, including its last minute in the business timezone', () => {
    expect(monthWindow('2026-09', at('2026-09-01T00:00:00+05:30'), 0, IST)).toBe('OPEN');
    expect(monthWindow('2026-09', at('2026-09-30T23:59:59+05:30'), 0, IST)).toBe('OPEN');
  });

  it('is CLOSED from the first moment of the next month (business time, not UTC)', () => {
    expect(monthWindow('2026-09', at('2026-10-01T00:00:00+05:30'), 0, IST)).toBe('CLOSED');
    // 19:00 UTC on the 30th is already 00:30 IST on 1 October.
    expect(monthWindow('2026-09', at('2026-09-30T19:00:00Z'), 0, IST)).toBe('CLOSED');
  });

  it('grace days keep it OPEN', () => {
    expect(monthWindow('2026-09', at('2026-10-05T23:00:00+05:30'), 5, IST)).toBe('OPEN');
    expect(monthWindow('2026-09', at('2026-10-06T00:00:00+05:30'), 5, IST)).toBe('CLOSED');
  });

  it('is FUTURE before the month begins', () => {
    expect(monthWindow('2026-10', at('2026-09-30T23:59:59+05:30'), 0, IST)).toBe('FUTURE');
    expect(monthWindow('2026-10', at('2026-10-01T00:00:00+05:30'), 0, IST)).toBe('OPEN');
  });
});
