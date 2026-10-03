import type { PaginatedDto } from '@greynote/contracts';

/** The API's page-size cap, which every "load them all" read must stay within. */
export const MAX_PAGE_SIZE = 100;

/**
 * Reads every page of a list. For reference data a picker or a label needs in full (the Zones, HQs,
 * Areas and Routes of a company: tens to a few hundred), never for something that grows without
 * bound. `maxPages` stops a runaway loop, and the result says whether it stopped early.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PaginatedDto<T>>,
  maxPages = 20,
): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchPage(page);
    items.push(...result.items);
    if (page >= result.totalPages) return { items, complete: true };
  }
  return { items, complete: false };
}
