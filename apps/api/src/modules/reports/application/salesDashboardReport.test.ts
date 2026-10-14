import { describe, expect, it } from 'vitest';
import { SalesDashboardReport } from './salesDashboardReport.js';

const config = { async get(key: string) { return key === 'BUSINESS_TIMEZONE' ? 'Asia/Kolkata' : ''; } };
const now = () => new Date('2026-10-09T06:00:00Z');
const people = [
  { id: 'mr1', employeeCode: 'E1', name: 'Asha', designation: 'MR', hqId: 'h1', zoneId: 'z1' },
  { id: 'mr2', employeeCode: 'E2', name: 'Bala', designation: 'MR', hqId: 'h1', zoneId: 'z1' },
  { id: 'asm', employeeCode: 'E3', name: 'Chitra', designation: 'ASM', hqId: 'h1', zoneId: 'z1' },
];

function build(over: { downline?: string[] } = {}) {
  const asked: Array<{ userId: string; month: string }> = [];
  const report = new SalesDashboardReport(
    {
      async listFieldEmployees(only) { return only ? people.filter((p) => only.includes(p.id)) : people; },
      async getDownline() { return (over.downline ?? []).map((id) => ({ id })); },
    },
    {
      async listDailyPlanDays(userId) {
        return userId === 'mr1'
          ? [{ date: '2026-10-07', status: 'APPROVED', routeIds: ['r1'] }, { date: '2026-10-08', status: 'SUBMITTED', routeIds: ['r1', 'r2'] }, { date: '2026-10-09', status: 'REJECTED', routeIds: [] }]
          : [];
      },
    },
    {
      async getMonth(userId, month) {
        asked.push({ userId, month });
        // 7th..9th are working days; the 6th is a weekly off.
        return { days: [{ date: '2026-10-06', status: 'WEEKLY_OFF' }, { date: '2026-10-07', status: 'PRESENT' }, { date: '2026-10-08', status: 'PRESENT' }, { date: '2026-10-09', status: 'NOT_YET' }] };
      },
    },
    {
      async summarizeTaDaByUser() { return [{ userId: 'mr1', taPaise: 5000, daPaise: 3000 }, { userId: 'mr2', taPaise: 100, daPaise: 200 }]; },
      async getDcrSummary(userId) { return userId === 'mr1' ? [{ reportDate: '2026-10-07', status: 'APPROVED' }, { reportDate: '2026-10-08', status: 'MANAGER_APPROVED' }, { reportDate: '2026-10-09', status: 'DRAFT' }] : []; },
    },
    { async listTargetShares(ids) { return ids.includes('mr1') ? [{ id: 't1', userId: 'mr1', productId: null, fromMonth: '2026-10', toMonth: '2026-10', amountPaise: 90_000, qty: null, sharePaise: 90_000, shareQty: null }] : []; } },
    {
      async sumUserOrders() { return [{ userId: 'mr1', productId: 'p1', month: '2026-10', quantity: 5, amountPaise: 4_000 }]; },
      async listEmployeeSales() { return [{ userId: 'mr1', productId: 'p1', month: '2026-10', secondaryQty: 40, adjustmentQty: 0 }]; },
    },
    { async listNames() { return { distributors: [], chemists: [], products: [{ id: 'p1', name: 'P', sku: 'P', ptrPaise: 1000, ptsPaise: 800 }] }; } } as never,
    { async getRoute(id) { return { id, name: `Route ${id}` }; }, async getZone() { return { id: 'z1', name: 'North' }; } },
    config,
    { entries: async () => [{ userId: 'mr1', productId: 'p1', month: '2026-10', secondaryQty: 40, adjustmentQty: 0 }] } as never,
    now,
  );
  return { report, asked };
}
const base = { from: '2026-10-06', to: '2026-10-09', page: 1, pageSize: 25 };

describe('SalesDashboardReport', () => {
  it('counts submitted and approved over working days only, and names zone, designation and routes', async () => {
    const { report } = build();
    const out = await report.read({ actor: { id: 'a', role: 'ADMIN' }, ...base });
    const mr1 = out.rows.find((r) => r.employee.id === 'mr1')!;
    expect(mr1).toMatchObject({ designation: 'MR', zone: 'North', routes: ['Route r1', 'Route r2'], workingDays: 3, taPaise: 5000, daPaise: 3000, targetPaise: 90_000, achievedPaise: 32_000, primaryPaise: 4_000 });
    expect(mr1.plan).toEqual({ submitted: 2, approved: 1 }); // the rejected one on the 9th is neither
    expect(mr1.dcr).toEqual({ submitted: 2, approved: 1 }); // MANAGER_APPROVED is submitted, not yet approved; the draft is neither
    expect(out.rows.find((r) => r.employee.id === 'mr2')!.plan).toEqual({ submitted: 0, approved: 0 });
  });

  it('totals cover every matching employee, not just the page', async () => {
    const { report } = build();
    const out = await report.read({ actor: { id: 'a', role: 'ADMIN' }, ...base, pageSize: 1 });
    expect(out.rows).toHaveLength(1);
    expect(out).toMatchObject({ total: 3, totalPages: 3, totals: { employees: 3, taPaise: 5100, daPaise: 3200, targetPaise: 90_000, achievedPaise: 32_000, primaryPaise: 4_000 } });
  });

  it('holds a future end to today and reports the months of both ends', async () => {
    const { report } = build();
    const out = await report.read({ actor: { id: 'a', role: 'ADMIN' }, from: '2026-10-08', to: '2026-10-20', page: 1, pageSize: 25 });
    expect(out).toMatchObject({ from: '2026-10-08', to: '2026-10-09', fromMonth: '2026-10', toMonth: '2026-10' });
  });

  it('searches by name or code', async () => {
    const { report } = build();
    const out = await report.read({ actor: { id: 'a', role: 'ADMIN' }, ...base, search: 'e2' });
    expect(out.rows.map((r) => r.employee.id)).toEqual(['mr2']);
  });

  it('a manager sees only their downline; a field employee without a team is refused', async () => {
    const out = await build({ downline: ['mr1', 'mr2'] }).report.read({ actor: { id: 'asm', role: 'FIELD' }, ...base });
    expect(out.rows.map((r) => r.employee.id)).toEqual(['mr1', 'mr2']);
    await expect(build().report.read({ actor: { id: 'mr1', role: 'FIELD' }, ...base })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses more than 93 days', async () => {
    await expect(build().report.read({ actor: { id: 'a', role: 'ADMIN' }, from: '2026-06-01', to: '2026-10-09', page: 1, pageSize: 25 })).rejects.toBeTruthy();
  });
});
