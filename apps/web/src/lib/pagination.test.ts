import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, pageRange, parsePageSize } from './pagination';

describe('pageRange', () => {
  it('counts the rows on the first, a middle and a partial last page', () => {
    expect(pageRange(1, 25, 61)).toEqual({ from: 1, to: 25 });
    expect(pageRange(2, 25, 61)).toEqual({ from: 26, to: 50 });
    expect(pageRange(3, 25, 61)).toEqual({ from: 51, to: 61 });
  });

  it('is 0 to 0 with no rows, and never runs past the total', () => {
    expect(pageRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
    expect(pageRange(1, 25, 7)).toEqual({ from: 1, to: 7 });
    expect(pageRange(9, 25, 7)).toEqual({ from: 7, to: 7 });
  });
});

describe('parsePageSize', () => {
  it('accepts the offered sizes and falls back to the default for anything else', () => {
    expect(parsePageSize('50')).toBe(50);
    expect(parsePageSize('7')).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize('abc')).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(null)).toBe(DEFAULT_PAGE_SIZE);
  });
});
