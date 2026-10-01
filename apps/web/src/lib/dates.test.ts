import { describe, expect, it } from 'vitest';
import { addDays, ageLabel, istDate, istMonth, previousMonth } from './dates';

describe('istDate / istMonth', () => {
  it('uses the Indian calendar day, not the UTC one', () => {
    // 20:00 UTC on 30 Sep is 01:30 IST on 1 Oct.
    const now = new Date('2026-09-30T20:00:00Z');
    expect(istDate(now)).toBe('2026-10-01');
    expect(istMonth(now)).toBe('2026-10');
  });

  it('is still the same day just before IST midnight', () => {
    expect(istDate(new Date('2026-09-30T18:29:00Z'))).toBe('2026-09-30');
  });
});

describe('previousMonth', () => {
  it('steps back one month', () => expect(previousMonth('2026-10')).toBe('2026-09'));
  it('crosses a year boundary', () => expect(previousMonth('2026-01')).toBe('2025-12'));
});

describe('addDays', () => {
  it('moves forward and back across month ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('ageLabel', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  it.each([
    ['2026-10-01T11:59:40Z', 'just now'],
    ['2026-10-01T11:30:00Z', '30m'],
    ['2026-10-01T07:00:00Z', '5h'],
    ['2026-09-28T12:00:00Z', '3d'],
  ])('%s -> %s', (iso, expected) => expect(ageLabel(iso, now)).toBe(expected));
});
