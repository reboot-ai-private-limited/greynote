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
    history: (query: object) => [...keys.approvals.all(), 'history', query] as const,
    detail: (id: string) => [...keys.approvals.all(), 'detail', id] as const,
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
  payComponents: { all: () => ['payComponents', fy()] as const },
  ctc: {
    all: () => ['ctc', fy()] as const,
    history: (userId: string) => [...keys.ctc.all(), 'history', userId] as const,
    preview: (body: object) => [...keys.ctc.all(), 'preview', body] as const,
  },
  leaves: {
    /** Every leave query for the year in view: balances, lists and details. */
    root: () => ['leaves', fy()] as const,
    detail: (id: string) => ['leaves', fy(), 'detail', id] as const,
    balances: (userId: string, year: number | undefined) => ['leaves', fy(), 'balances', userId, year ?? 'current'] as const,
    range: (query: object) => ['leaves', fy(), 'range', query] as const,
    all: (query: object) => ['leaves', fy(), 'all', query] as const,
  },
  hr: {
    leaveTypes: () => ['hr', fy(), 'leaveTypes'] as const,
    policies: () => ['hr', fy(), 'policies'] as const,
    holidays: (query: object) => ['hr', fy(), 'holidays', query] as const,
    allHolidays: () => ['hr', fy(), 'holidays'] as const,
  },
  userHq: { history: (userId: string) => ['userHq', fy(), userId] as const },
  dcr: { detail: (id: string) => ['dcr', fy(), 'detail', id] as const },
  plans: {
    daily: (id: string) => ['plans', fy(), 'daily', id] as const,
    monthly: (id: string) => ['plans', fy(), 'monthly', id] as const,
    change: (id: string) => ['plans', fy(), 'change', id] as const,
  },
  doctorServices: { detail: (id: string) => ['doctorServices', fy(), 'detail', id] as const },
  expenses: {
    all: () => ['expenses', fy()] as const,
    audit: (query: object) => [...keys.expenses.all(), 'audit', query] as const,
  },
  payroll: {
    all: () => ['payroll', fy()] as const,
    month: (query: object) => [...keys.payroll.all(), 'month', query] as const,
    detail: (id: string) => [...keys.payroll.all(), 'detail', id] as const,
  },
  monthlyStock: { missing: (month: string) => ['monthlyStock', fy(), 'missing', month] as const },
  routes: {
    all: () => ['routes', fy()] as const,
    list: (query?: object) => [...keys.routes.all(), 'list', query ?? {}] as const,
    /** Every row, all pages: for pickers and labels. Under `all`, so a territory edit refreshes it. */
    directory: () => [...keys.routes.all(), 'directory'] as const,
    detail: (id: string) => [...keys.routes.all(), 'detail', id] as const,
    assignments: (id: string, includeHistory: boolean) => [...keys.routes.all(), 'assignments', id, includeHistory] as const,
  },
  products: {
    all: () => ['products', fy()] as const,
    list: (query?: object) => [...keys.products.all(), 'list', query ?? {}] as const,
    /** Every active product, all pages: the sample picker's options. */
    directory: () => [...keys.products.all(), 'directory'] as const,
  },
  chemists: {
    all: () => ['chemists', fy()] as const,
    list: (query?: object) => [...keys.chemists.all(), 'list', query ?? {}] as const,
    detail: (id: string) => [...keys.chemists.all(), 'detail', id] as const,
  },
  distributors: {
    all: () => ['distributors', fy()] as const,
    list: (query?: object) => [...keys.distributors.all(), 'list', query ?? {}] as const,
    detail: (id: string) => [...keys.distributors.all(), 'detail', id] as const,
  },
  doctors: {
    all: () => ['doctors', fy()] as const,
    list: (query?: object) => [...keys.doctors.all(), 'list', query ?? {}] as const,
    detail: (id: string) => [...keys.doctors.all(), 'detail', id] as const,
    assignments: (id: string) => [...keys.doctors.all(), 'assignments', id] as const,
    samples: (id: string) => [...keys.doctors.all(), 'samples', id] as const,
  },
  config: {
    all: () => ['config', fy()] as const,
    list: () => [...keys.config.all(), 'list'] as const,
    /** Not tied to a financial year: it says how years are drawn. */
    public: () => ['config', 'public'] as const,
  },
  places: { search: (q: string) => ['places', 'search', q] as const },
  fieldEmployees: { search: (q: string) => ['users', fy(), 'field', q] as const },
  zones: {
    all: () => ['zones', fy()] as const,
    list: (query?: object) => [...keys.zones.all(), 'list', query ?? {}] as const,
    /** Every row, all pages: for pickers and labels. Under `all`, so a territory edit refreshes it. */
    directory: () => [...keys.zones.all(), 'directory'] as const,
  },
  hqs: {
    all: () => ['hqs', fy()] as const,
    list: (query?: object) => [...keys.hqs.all(), 'list', query ?? {}] as const,
    /** Every row, all pages: for pickers and labels. Under `all`, so a territory edit refreshes it. */
    directory: () => [...keys.hqs.all(), 'directory'] as const,
  },
};

/** How long each kind of data counts as fresh. Pick from here, never a bare number. */
export const staleTime = {
  /** Master data and settings: changes rarely, and an admin edit invalidates it anyway. */
  configuration: 60_000,
  /** Operational lists someone else is updating: queues, approvals. */
  live: 0,
} as const;
