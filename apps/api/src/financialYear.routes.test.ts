import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { FinancialYearRule } from './shared/http/financialYear.middleware.js';

/**
 * The guard for the financial-year toggle (docs/hld/09): every GET route in the API is listed here as one of
 *   scoped   — returns dated business records and carries `scopeToFinancialYear(...)`, so a past-year view cannot leak
 *              another year into it;
 *   by-id    — one record opened by an id that only comes from a scoped list (decision-log 2026-09-30);
 *   timeless — data that does not change with the year (masters, config, catalogues) or is not in the toggle's scope.
 * A new GET route fails this test until it is classified — which is the moment to decide whether it needs a scope.
 */
type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: { financialYearRule?: FinancialYearRule } }> }; name?: string; handle?: { stack?: Layer[] }; regexp?: { source: string; fast_slash?: boolean } };

function mountOf(layer: Layer): string {
  if (layer.regexp?.fast_slash) return '';
  return (layer.regexp?.source ?? '').replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
}
function collect(stack: Layer[], prefix = ''): Array<{ path: string; rule: FinancialYearRule | undefined }> {
  const out: Array<{ path: string; rule: FinancialYearRule | undefined }> = [];
  for (const layer of stack) {
    if (layer.route) {
      if (layer.route.methods.get) out.push({ path: (prefix + layer.route.path).replace(/(.)\/$/, '$1'), rule: layer.route.stack.map((l) => l.handle.financialYearRule).find(Boolean) });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      out.push(...collect(layer.handle.stack, prefix + mountOf(layer)));
    }
  }
  return out;
}

const SCOPED = [
  '/api/field-activity/dcr',
  '/api/field-activity/dcr/team',
  '/api/field-activity/expenses',
  '/api/field-activity/expense-payouts',
  '/api/planning/daily',
  '/api/planning/monthly',
  '/api/hr/leaves/me',
  '/api/hr/leaves',
  '/api/hr/leave-balances/me',
  '/api/hr/leave-balances/:userId',
  '/api/sales/orders',
  '/api/payroll',
  '/api/approvals/inbox',
  '/api/approvals/all',
  '/api/approvals/team',
  '/api/approvals/mine',
];
const BY_ID = [
  '/api/field-activity/dcr/:id',
  '/api/planning/daily/:id',
  '/api/planning/changes/:id',
  '/api/field-activity/doctor-services/:id',
  '/api/planning/daily/:id/changes',
  '/api/planning/monthly/:id',
  '/api/hr/leaves/:id',
  '/api/sales/orders/:id',
  '/api/payroll/:id',
  '/api/approvals/:id',
];
const TIMELESS = [
  '/api/config', // system settings: global, not a dated record
  '/api/config/public',
  '/api/config/financial-year', // closing a year is an Admin action on the system, not a dated report
  // Operational and master data — the same whichever year is being looked at.
  '/api/health',
  '/api/identity/auth/me',
  '/api/identity/devices/pending',
  '/api/identity/users/:id/devices',
  '/api/identity/users',
  '/api/identity/users/:id',
  '/api/identity/roles',
  '/api/identity/designations',
  '/api/identity/pay-bands',
  '/api/identity/pay-components',
  '/api/identity/users/:id/ctc', // an employee's CTC revisions, a master record with its own effective months
  '/api/territory/zones',
  '/api/territory/hqs',
  '/api/territory/routes',
  '/api/territory/routes/:id',
  '/api/territory/routes/:id/assignments',
  '/api/territory/places/search',
  '/api/territory/my-routes',
  '/api/territory/users/:userId/hq',
  '/api/field-master-data/doctors/mine',
  '/api/field-master-data/doctors/team',
  '/api/field-master-data/doctors/added',
  '/api/field-master-data/doctors',
  '/api/field-master-data/doctors/:id',
  '/api/field-master-data/doctors/:id/assignments',
  '/api/field-master-data/doctors/:id/sample-allocations',
  '/api/field-master-data/products',
  '/api/field-master-data/specialties',
  '/api/field-master-data/specialties/:id',
  '/api/field-master-data/products/:id',
  '/api/field-master-data/distributors',
  '/api/field-master-data/distributors/:id',
  '/api/field-master-data/chemists',
  '/api/field-master-data/chemists/:id',
  '/api/hr/leave-types',
  '/api/hr/leave-policies',
  '/api/marketing/visuals',
  '/api/marketing/campaigns',
  // The upcoming-holidays list (PRD 6.2 D) — a calendar, not a report on a past year.
  '/api/hr/holidays',
  // Background sync: the phone never sends the year header on it (decision-log 2026-09-30).
  '/api/sync/pull',
  '/api/sync/drafts',
  // Month or record reports outside the toggle's agreed scope (sign-off J2): scoping them is a one-line change if that grows.
  '/api/marketing/targets/:userId',
  '/api/sales/monthly-stock',
  '/api/sales/monthly-stock/missing',
  '/api/field-activity/doctor-services',
  '/api/field-activity/doctor-gifts',
  '/api/planning/late-grants',
];

describe('financial-year route classification', () => {
  const routes = collect((createApp() as unknown as { _router: { stack: Layer[] } })._router.stack);

  it('finds the API’s GET routes', () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it('every GET route is classified — scoped, by-id or timeless', () => {
    const known = new Set([...SCOPED, ...BY_ID, ...TIMELESS]);
    const unclassified = routes.map((r) => r.path).filter((p) => !known.has(p));
    expect(unclassified, 'Classify these GET routes in financialYear.routes.test.ts (and add scopeToFinancialYear if they list dated records)').toEqual([]);
  });

  it('exactly the scoped routes carry the scope middleware', () => {
    const scoped = new Set(SCOPED);
    for (const r of routes) {
      if (scoped.has(r.path)) expect(r.rule, `${r.path} is listed as scoped but has no scopeToFinancialYear`).toBeDefined();
      else expect(r.rule, `${r.path} carries scopeToFinancialYear but is not listed as scoped`).toBeUndefined();
    }
    expect(routes.filter((r) => scoped.has(r.path)).length).toBe(SCOPED.length); // none listed that does not exist
  });

  it('no route is classified twice, and none listed that does not exist', () => {
    const all = [...SCOPED, ...BY_ID, ...TIMELESS];
    expect(new Set(all).size).toBe(all.length);
    const present = new Set(routes.map((r) => r.path));
    expect(all.filter((p) => !present.has(p))).toEqual([]);
  });
});
