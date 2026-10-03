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
  approvals: {
    all: () => ['approvals', fy()] as const,
    inbox: (query: object) => [...keys.approvals.all(), 'inbox', query] as const,
  },
  devices: {
    all: () => ['devices', fy()] as const,
    pending: () => [...keys.devices.all(), 'pending'] as const,
    forUser: (userId: string) => [...keys.devices.all(), 'user', userId] as const,
  },
  users: {
    all: () => ['users', fy()] as const,
    list: (query: object) => [...keys.users.all(), 'list', query] as const,
    detail: (id: string) => [...keys.users.all(), 'detail', id] as const,
  },
  designations: { all: () => ['designations', fy()] as const },
  payBands: { all: () => ['payBands', fy()] as const },
  leaves: { range: (query: object) => ['leaves', fy(), 'range', query] as const },
  expenses: { audit: (query: object) => ['expenses', fy(), 'audit', query] as const },
  payroll: { month: (query: object) => ['payroll', fy(), 'month', query] as const },
  monthlyStock: { missing: (month: string) => ['monthlyStock', fy(), 'missing', month] as const },
  routes: {
    all: () => ['routes', fy()] as const,
    list: (query?: object) => [...keys.routes.all(), 'list', query ?? {}] as const,
    detail: (id: string) => [...keys.routes.all(), 'detail', id] as const,
    assignments: (id: string, includeHistory: boolean) => [...keys.routes.all(), 'assignments', id, includeHistory] as const,
  },
  places: { search: (q: string) => ['places', 'search', q] as const },
  fieldEmployees: { search: (q: string) => ['users', fy(), 'field', q] as const },
  zones: {
    all: () => ['zones', fy()] as const,
    list: (query?: object) => [...keys.zones.all(), 'list', query ?? {}] as const,
  },
  hqs: {
    all: () => ['hqs', fy()] as const,
    list: (query?: object) => [...keys.hqs.all(), 'list', query ?? {}] as const,
  },
  areas: {
    all: () => ['areas', fy()] as const,
    list: (query?: object) => [...keys.areas.all(), 'list', query ?? {}] as const,
  },
};

/** How long each kind of data counts as fresh. Pick from here, never a bare number. */
export const staleTime = {
  /** Master data and settings: changes rarely, and an admin edit invalidates it anyway. */
  configuration: 60_000,
  /** Operational lists someone else is updating: queues, approvals. */
  live: 0,
} as const;
