import type { PaginatedDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { fetchAllPages } from './allPages';

const pages = (counts: number[]) => async (page: number): Promise<PaginatedDto<number>> => ({
  items: Array.from({ length: counts[page - 1] ?? 0 }, (_, i) => page * 100 + i),
  page,
  pageSize: 100,
  total: counts.reduce((a, b) => a + b, 0),
  totalPages: counts.length,
});

describe('fetchAllPages', () => {
  it('reads every page, in order', async () => {
    const result = await fetchAllPages(pages([2, 2, 1]));
    expect(result.complete).toBe(true);
    expect(result.items).toEqual([100, 101, 200, 201, 300]);
  });
  it('makes one request for a single page', async () => {
    let calls = 0;
    const result = await fetchAllPages(async (page) => {
      calls += 1;
      return pages([3])(page);
    });
    expect(calls).toBe(1);
    expect(result.items).toHaveLength(3);
  });
  it('handles an empty list', async () => {
    expect(await fetchAllPages(async () => ({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }))).toEqual({ items: [], complete: true });
  });
  it('stops at maxPages and says it did not finish', async () => {
    let calls = 0;
    const result = await fetchAllPages(async (page) => {
      calls += 1;
      return pages(Array.from({ length: 50 }, () => 1))(page);
    }, 3);
    expect(calls).toBe(3);
    expect(result).toMatchObject({ complete: false });
    expect(result.items).toHaveLength(3);
  });
});
