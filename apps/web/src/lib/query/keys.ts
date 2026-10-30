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
    reporting: (id: string) => [...keys.users.all(), 'reporting', id] as const,
  },
  org: {
    all: () => ['org', fy()] as const,
    children: (parentId: string | null, page: number) => ['org', fy(), 'children', parentId, page] as const,
  },
  employeeDrafts: {
    all: () => ['employeeDrafts', fy()] as const,
    detail: (id: string) => [...keys.employeeDrafts.all(), 'detail', id] as const,
  },
  lateGrants: {
    all: () => ['lateGrants', fy()] as const,
    list: (query: object) => [...keys.lateGrants.all(), 'list', query] as const,
  },
  designations: { all: () => ['designations', fy()] as const },
  payBands: { all: () => ['payBands', fy()] as const },
  payComponents: { all: () => ['payComponents', fy()] as const },
  ctc: {
    all: () => ['ctc', fy()] as const,
    history: (userId: string) => [...keys.ctc.all(), 'history', userId] as const,
    preview: (body: object) => [...keys.ctc.all(), 'preview', body] as const,
  },
  promotions: {
    all: () => ['promotions', fy()] as const,
    forUser: (userId: string) => [...keys.promotions.all(), 'user', userId] as const,
    list: (status: string) => [...keys.promotions.all(), 'list', status] as const,
    preview: (userId: string, body: object) => [...keys.promotions.all(), 'preview', userId, body] as const,
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
    weeklyOffs: (query: object) => ['hr', fy(), 'weekly-offs', query] as const,
    allHolidays: () => ['hr', fy(), 'holidays'] as const,
  },
  inbox: {
    all: () => ['inbox'] as const,
    sent: (query: object) => ['inbox', 'sent', query] as const,
  },
  documents: { all: () => ['documents'] as const },
  managerCandidates: (q: object) => ['managerCandidates', fy(), q] as const,
  managerCoverage: (userId: string) => ['managerCoverage', fy(), userId] as const,
  teamGaps: { all: () => ['teamGaps'] as const, one: (userId: string) => ['teamGaps', fy(), userId] as const, list: () => ['teamGaps', fy(), 'list'] as const },
  userHq: { history: (userId: string) => ['userHq', fy(), userId] as const },
  dcr: { detail: (id: string) => ['dcr', fy(), 'detail', id] as const },
  plans: {
    daily: (id: string) => ['plans', fy(), 'daily', id] as const,
    monthly: (id: string) => ['plans', fy(), 'monthly', id] as const,
  },
  doctorServices: {
    all: () => ['doctorServices', fy()] as const,
    detail: (id: string) => [...keys.doctorServices.all(), 'detail', id] as const,
    list: (query: object) => [...keys.doctorServices.all(), 'list', query] as const,
  },
  doctorGifts: {
    all: () => ['doctor-gifts', fy()] as const,
    list: (query: object) => [...keys.doctorGifts.all(), 'list', query] as const,
  },
  expenses: {
    all: () => ['expenses', fy()] as const,
    audit: (query: object) => [...keys.expenses.all(), 'audit', query] as const,
    payouts: (month: string) => [...keys.expenses.all(), 'payouts', month] as const,
    month: (id: string) => [...keys.expenses.all(), 'month', id] as const,
    overview: (month: string) => [...keys.expenses.all(), 'overview', month] as const,
    review: (userId: string, month: string) => [...keys.expenses.all(), 'review', userId, month] as const,
    grants: (query: object) => [...keys.expenses.all(), 'grants', query] as const,
  },
  reports: {
    all: () => ['reports', fy()] as const,
    orders: (query: object) => [...keys.reports.all(), 'orders', query] as const,
    order: (id: string) => [...keys.reports.all(), 'order', id] as const,
    salesYear: (query: object) => [...keys.reports.all(), 'salesYear', query] as const,
    salesStatement: (query: object) => [...keys.reports.all(), 'salesStatement', query] as const,
    stock: (month: string) => [...keys.reports.all(), 'stock', month] as const,
    salesDashboard: (query: object) => [...keys.reports.all(), 'salesDashboard', query] as const,
    employeeSales: (query: object) => [...keys.reports.all(), 'employeeSales', query] as const,
    salaryYear: (year: number) => [...keys.reports.all(), 'salaryYear', year] as const,
    dcrYear: (year: number) => [...keys.reports.all(), 'dcrYear', year] as const,
    doctorVisits: (userId: string | undefined, month: string) => [...keys.reports.all(), 'doctorVisits', userId ?? 'all', month] as const,
    dcrCoverage: (userId: string, month: string) => [...keys.reports.all(), 'dcrCoverage', userId, month] as const,
    taDaYear: (year: number) => [...keys.reports.all(), 'taDaYear', year] as const,
    taDaDays: (userId: string, month: string) => [...keys.reports.all(), 'taDaDays', userId, month] as const,
  },
  attendance: {
    all: () => ['attendance', fy()] as const,
    month: (userId: string, month: string) => [...keys.attendance.all(), 'month', userId, month] as const,
    payroll: (month: string) => [...keys.attendance.all(), 'payroll', month] as const,
  },
  payroll: {
    all: () => ['payroll', fy()] as const,
    month: (query: object) => [...keys.payroll.all(), 'month', query] as const,
    warnings: (month: string) => [...keys.payroll.all(), 'warnings', month] as const,
    paidTotals: () => [...keys.payroll.all(), 'paidTotals'] as const,
    detail: (id: string) => [...keys.payroll.all(), 'detail', id] as const,
  },
  monthlyStock: { missing: (month: string) => ['monthlyStock', fy(), 'missing', month] as const },
  routes: {
    all: () => ['routes', fy()] as const,
    list: (query?: object) => [...keys.routes.all(), 'list', query ?? {}] as const,
    /** Every row, all pages: for pickers and labels. Under `all`, so a territory edit refreshes it. */
    directory: () => [...keys.routes.all(), 'directory'] as const,
    detail: (id: string) => [...keys.routes.all(), 'detail', id] as const,
    forUser: (userId: string) => [...keys.routes.all(), 'for-user', userId] as const,
    assignments: (id: string, includeHistory: boolean) => [...keys.routes.all(), 'assignments', id, includeHistory] as const,
  },
  products: {
    all: () => ['products', fy()] as const,
    list: (query?: object) => [...keys.products.all(), 'list', query ?? {}] as const,
    /** Every active product, all pages: the sample picker's options. */
    directory: () => [...keys.products.all(), 'directory'] as const,
  },
  /** Specialities are a master list, the same whichever year is in view. */
  specialties: {
    all: () => ['specialties'] as const,
    list: (query?: object) => [...keys.specialties.all(), 'list', query ?? {}] as const,
    active: () => [...keys.specialties.all(), 'active'] as const,
  },
  chemists: {
    all: () => ['chemists', fy()] as const,
    list: (query?: object) => [...keys.chemists.all(), 'list', query ?? {}] as const,
    detail: (id: string) => [...keys.chemists.all(), 'detail', id] as const,
  },
  distributorStatement: {
    all: () => ['distributorStatement', fy()] as const,
    month: (distributorId: string, month: string) => [...keys.distributorStatement.all(), distributorId, month] as const,
  },
  employeeMonth: {
    all: () => ['employeeMonth', fy()] as const,
    month: (userId: string, month: string) => [...keys.employeeMonth.all(), userId, month] as const,
  },
  distributorPayments: {
    all: () => ['distributorPayments', fy()] as const,
    list: (query: object) => [...keys.distributorPayments.all(), 'list', query] as const,
    orders: (query: object) => [...keys.distributorPayments.all(), 'orders', query] as const,
    totals: (query: object) => [...keys.distributorPayments.all(), 'totals', query] as const,
    balances: () => [...keys.distributorPayments.all(), 'balances'] as const,
    outstanding: () => [...keys.distributorPayments.all(), 'outstanding'] as const,
  },
  invoices: {
    all: () => ['invoices', fy()] as const,
    list: (query: object) => [...keys.invoices.all(), 'list', query] as const,
    detail: (orderId: string) => [...keys.invoices.all(), 'detail', orderId] as const,
  },
  distributors: {
    all: () => ['distributors', fy()] as const,
    list: (query?: object) => [...keys.distributors.all(), 'list', query ?? {}] as const,
    detail: (id: string) => [...keys.distributors.all(), 'detail', id] as const,
    impact: (id: string) => [...keys.distributors.all(), 'impact', id] as const,
  },
  doctors: {
    all: () => ['doctors', fy()] as const,
    list: (query?: object) => [...keys.doctors.all(), 'list', query ?? {}] as const,
    detail: (id: string) => [...keys.doctors.all(), 'detail', id] as const,
    assignments: (id: string) => [...keys.doctors.all(), 'assignments', id] as const,
    samples: (id: string) => [...keys.doctors.all(), 'samples', id] as const,
    impact: (id: string) => [...keys.doctors.all(), 'impact', id] as const,
  },
  visuals: {
    all: () => ['visuals', fy()] as const,
    list: (query?: object) => [...keys.visuals.all(), 'list', query ?? {}] as const,
    forDoctor: (doctorId: string) => [...keys.visuals.all(), 'doctor', doctorId] as const,
  },
  config: {
    all: () => ['config', fy()] as const,
    list: () => [...keys.config.all(), 'list'] as const,
    financialYear: () => [...keys.config.all(), 'financial-year'] as const,
    /** Not tied to a financial year: it says how years are drawn. */
    public: () => ['config', 'public'] as const,
  },
  places: { search: (q: string) => ['places', 'search', q] as const },
  fieldDirectory: () => ['users', fy(), 'field-directory'] as const,
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
