/**
 * Query keys, one factory per module. A key is never written as a literal at a call site: a typo
 * there is a cache that silently never invalidates.
 *
 * The financial year is part of every key's root — a past year returns different data, so a year
 * switch must not serve the previous year's cache.
 */

import { getFinancialYear } from '../financial-year';

const fy = () => getFinancialYear() ?? 'current';

export const keys = {
  zones: {
    all: () => ['zones', fy()] as const,
    list: (query?: object) => [...keys.zones.all(), 'list', query ?? {}] as const,
  },
};

/** How long each kind of data counts as fresh. Pick from here, never a bare number. */
export const staleTime = {
  /** Master data and settings: changes rarely, and an admin edit invalidates it anyway. */
  configuration: 60_000,
  /** Operational lists someone else is updating: queues, approvals. */
  live: 0,
} as const;
