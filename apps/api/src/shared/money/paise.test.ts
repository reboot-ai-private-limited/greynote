import { describe, expect, it } from 'vitest';
import { formatPaise, isPaise, MAX_PAISE, multiplyPaise, paiseSchema, proratePaise, rupeesToPaise } from './paise.js';

describe('isPaise / paiseSchema', () => {
  it('a whole, non-negative, sane number', () => {
    for (const ok of [0, 1, 750, 2_000_000, MAX_PAISE]) expect(isPaise(ok)).toBe(true);
    for (const bad of [-1, 1.5, 0.1 + 0.2, NaN, Infinity, MAX_PAISE + 1, '100', null, undefined]) expect(isPaise(bad)).toBe(false);
  });

  it('the request schema refuses a decimal, a negative and a string instead of rounding', () => {
    expect(paiseSchema.parse(750)).toBe(750);
    expect(paiseSchema.safeParse(7.5).success).toBe(false);
    expect(paiseSchema.safeParse(-5).success).toBe(false);
    expect(paiseSchema.safeParse('750').success).toBe(false);
    expect(paiseSchema.safeParse(MAX_PAISE + 1).success).toBe(false);
  });
});

describe('multiplyPaise — TA is a rate times a distance, rounded half up to a paise once', () => {
  it('is exact for whole distances', () => {
    expect(multiplyPaise(750, '12')).toBe(9000);
    expect(multiplyPaise(500, '10.5')).toBe(5250);
  });

  it('rounds half up, at the paise', () => {
    expect(multiplyPaise(333, '0.01')).toBe(3); // 3.33 → 3
    expect(multiplyPaise(350, '0.01')).toBe(4); // 3.50 → 4 (half up)
    expect(multiplyPaise(349, '0.01')).toBe(3); // 3.49 → 3
    expect(multiplyPaise(1, '0.5')).toBe(1); // 0.5 → 1
    expect(multiplyPaise(1, '0.49')).toBe(0);
    expect(multiplyPaise(750, '10.67')).toBe(8003); // 8002.5 → 8003
  });

  it('has none of floating point’s error', () => {
    // 0.1 + 0.2 style traps: 1005 × 1.005 in floats gives 1009.9999…
    expect(multiplyPaise(1005, '1.005')).toBe(1010); // 1010.025 → 1010
    expect(multiplyPaise(29, '10.05')).toBe(291); // 291.45 → 291
    expect(multiplyPaise(0, '99.99')).toBe(0);
    expect(multiplyPaise(750, '0')).toBe(0);
  });

  it('refuses what is not a paise amount or a plain decimal, and results that would not fit', () => {
    expect(() => multiplyPaise(750.5, '2')).toThrow(RangeError);
    expect(() => multiplyPaise(750, '-2')).toThrow(RangeError);
    expect(() => multiplyPaise(750, '1e3')).toThrow(RangeError);
    expect(() => multiplyPaise(750, '')).toThrow(RangeError);
    expect(() => multiplyPaise(MAX_PAISE, '99999999999')).toThrow(RangeError);
  });
});

describe('rupeesToPaise', () => {
  it('converts a typed rupee amount exactly, with or without paise', () => {
    expect(rupeesToPaise('20000')).toBe(2_000_000);
    expect(rupeesToPaise('7.5')).toBe(750);
    expect(rupeesToPaise('7.50')).toBe(750);
    expect(rupeesToPaise('0.05')).toBe(5);
    expect(rupeesToPaise(' 100 ')).toBe(10_000);
  });

  it('null for anything that isn’t a rupee amount with at most 2 places', () => {
    for (const bad of ['', 'abc', '1.234', '-1', '1,000', '1e3', '99999999999']) expect(rupeesToPaise(bad)).toBeNull();
  });
});

describe('formatPaise', () => {
  it('₹ with Indian grouping and two decimals', () => {
    expect(formatPaise(0)).toBe('₹0.00');
    expect(formatPaise(5)).toBe('₹0.05');
    expect(formatPaise(750)).toBe('₹7.50');
    expect(formatPaise(2_000_000)).toBe('₹20,000.00');
    expect(formatPaise(123_456_789)).toBe('₹12,34,567.89');
  });
});

describe('proratePaise — a share of an amount, rounded half up to a paise once', () => {
  it('is exact when it divides evenly', () => {
    expect(proratePaise(3_000_000, 2, 60)).toBe(100_000); // one day of a ₹30,000 month, in half-days
    expect(proratePaise(3_000_000, 0, 60)).toBe(0);
  });

  it('rounds half up, at the paise', () => {
    expect(proratePaise(1, 1, 2)).toBe(1); // 0.5 → 1
    expect(proratePaise(1, 1, 3)).toBe(0); // 0.33 → 0
    expect(proratePaise(2, 1, 3)).toBe(1); // 0.67 → 1
    expect(proratePaise(10, 1, 4)).toBe(3); // 2.5 → 3
    expect(proratePaise(10, 3, 8)).toBe(4); // 3.75 → 4
    expect(proratePaise(15, 1, 30)).toBe(1); // 0.5 → 1
    expect(proratePaise(14, 1, 30)).toBe(0); // 0.47 → 0
  });

  it('never goes through floating point, at the largest amounts', () => {
    expect(proratePaise(MAX_PAISE, 60, 60)).toBe(MAX_PAISE);
    expect(proratePaise(MAX_PAISE, 1, 60)).toBe(166_666_667); // 166,666,666.67
  });

  it('refuses a fraction, a negative, a zero denominator and a non-paise amount', () => {
    for (const [paise, n, d] of [[100, 1.5, 2], [100, -1, 2], [100, 1, 0], [1.5, 1, 2], [-1, 1, 2]] as Array<[number, number, number]>) expect(() => proratePaise(paise, n, d)).toThrow(RangeError);
  });
});
