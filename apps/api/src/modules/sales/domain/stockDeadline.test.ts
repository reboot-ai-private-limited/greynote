import { describe, expect, it } from 'vitest';
import { monthWindow, stockDeadline } from './stockDeadline.js';

const IST = 'Asia/Kolkata';
/** 23:59:59.999 IST on the given day, as an instant. */
const endOf = (day: string) => new Date(`${day}T23:59:59.999+05:30`);

describe('stockDeadline', () => {
  it.each([
    ['2026-09', '2026-10-05'],
    ['2026-02', '2026-03-05'], // short month
    ['2028-02', '2028-03-05'], // leap year
    ['2026-12', '2027-01-05'], // year end
  ])('with the 5th as the deadline day, %s is due at the end of %s', (month, due) => {
    expect(stockDeadline(month, 5, IST)).toEqual(endOf(due));
  });

  it('follows the configured day', () => {
    expect(stockDeadline('2026-09', 1, IST)).toEqual(endOf('2026-10-01'));
    expect(stockDeadline('2026-12', 28, IST)).toEqual(endOf('2027-01-28'));
  });
});

describe('monthWindow', () => {
  const at = (iso: string) => new Date(iso);

  it('is OPEN all through the month and up to the end of the deadline day (business time, not UTC)', () => {
    expect(monthWindow('2026-09', at('2026-09-01T00:00:00+05:30'), 5, IST)).toBe('OPEN');
    expect(monthWindow('2026-09', at('2026-10-01T00:00:00+05:30'), 5, IST)).toBe('OPEN');
    expect(monthWindow('2026-09', at('2026-10-05T23:59:59+05:30'), 5, IST)).toBe('OPEN');
  });

  it('is CLOSED from the first moment after the deadline day', () => {
    expect(monthWindow('2026-09', at('2026-10-06T00:00:00+05:30'), 5, IST)).toBe('CLOSED');
    // 19:00 UTC on the 5th is already 00:30 IST on the 6th.
    expect(monthWindow('2026-09', at('2026-10-05T19:00:00Z'), 5, IST)).toBe('CLOSED');
  });

  it('is FUTURE before the month begins', () => {
    expect(monthWindow('2026-10', at('2026-09-30T23:59:59+05:30'), 5, IST)).toBe('FUTURE');
    expect(monthWindow('2026-10', at('2026-10-01T00:00:00+05:30'), 5, IST)).toBe('OPEN');
  });
});
