import { describe, expect, it } from 'vitest';
import { SalesDashboardReport } from './salesDashboardReport.js';
import { TeamOverviewReport } from './teamOverviewReport.js';

const config = {
  async get(key: string) {
    return key === 'BUSINESS_TIMEZONE' ? 'Asia/Kolkata' : '';
  },
};
const now = () => new Date('2026-10-09T06:00:00Z');
const people = [
  { id: 'asm', employeeCode: 'E0', name: 'Chitra', designation: 'ASM', hqId: 'h1', zoneId: 'z1' },
  { id: 'mr1', employeeCode: 'E1', name: 'Asha', designation: 'MR', hqId: 'h1', zoneId: 'z1' },
  { id: 'mr2', employeeCode: 'E2', name: 'Bala', designation: 'MR', hqId: 'h1', zoneId: 'z1' },
];
// The RSM's team: the ASM at depth 1, both MRs under the ASM at depth 2.
const DOWNLINE = [
  { id: 'asm', depth: 1 },
  { id: 'mr1', depth: 2 },
  { id: 'mr2', depth: 2 },
];
const dcrRow = (userId: string, over = {}) => ({
  userId,
  month: '2026-10',
  reportedDays: 2,
  lateDays: 1,
  doctorCalls: 8,
  chemistCalls: 2,
  followups: 3,
  geofence: { pass: 8, fail: 1, unverified: 1, override: 0 },
  notInPlan: 0,
  followupsNotInPlan: 0,
  offRouteCalls: 0,
  ...over,
});

function build() {
  const dashboard = new SalesDashboardReport(
    {
      async listFieldEmployees(only) {
        return only ? people.filter((p) => only.includes(p.id)) : people;
      },
      async getDownline(id) {
        return id === 'rsm' ? DOWNLINE : [];
      },
      async getDesignationLevels(ids) {
        return ids.map((userId) => ({ userId, level: 1 }));
      },
    },
    {
      async listDailyPlanDays() {
        return [];
      },
    },
    {
      async getMonth() {
        return {
          days: [
            { date: '2026-10-06', status: 'WEEKLY_OFF' },
            { date: '2026-10-07', status: 'PRESENT' },
            { date: '2026-10-08', status: 'LEAVE' },
            { date: '2026-10-09', status: 'ABSENT' },
          ],
        };
      },
    },
    {
      async summarizeTaDaByUser() {
        return [{ userId: 'mr1', taPaise: 5000, daPaise: 3000 }];
      },
      async getDcrSummary() {
        return [];
      },
    },
    {
      async listTargetShares() {
        return [];
      },
    },
    {
      async sumUserOrders() {
        return [];
      },
      async listEmployeeSales() {
        return [];
      },
    },
    {
      async listNames() {
        return { distributors: [], chemists: [], products: [] };
      },
    } as never,
    {
      async getRoute(id) {
        return { id, name: id };
      },
      async getZone() {
        return { id: 'z1', name: 'North' };
      },
    },
    config,
    { entries: async () => [] } as never,
    now,
  );
  return new TeamOverviewReport(
    dashboard,
    {
      async summarizeDcrs() {
        return [
          dcrRow('mr1'),
          dcrRow('asm', {
            reportedDays: 1,
            lateDays: 0,
            doctorCalls: 4,
            chemistCalls: 0,
            followups: 0,
          }),
          dcrRow('stranger'),
        ];
      },
      async listCalledDoctorIds() {
        return [];
      },
      async summarizeExpenses() {
        return [];
      },
      async listAcceptedExpenses() {
        return [];
      },
    },
    {
      async getMonth() {
        return {
          days: [
            { date: '2026-10-06', status: 'WEEKLY_OFF' },
            { date: '2026-10-07', status: 'PRESENT' },
            { date: '2026-10-08', status: 'LEAVE' },
            { date: '2026-10-09', status: 'ABSENT' },
          ],
        };
      },
    },
  );
}
const base = { actor: { id: 'rsm', role: 'FIELD' }, month: '2026-10', page: 1, pageSize: 25 };

describe('TeamOverviewReport', () => {
  it('adds the field figures and the attendance counts to each person of the downline', async () => {
    const out = await build().read(base);
    expect(out.rows.map((r) => r.employee.id)).toEqual(['asm', 'mr1', 'mr2']);
    const mr1 = out.rows.find((r) => r.employee.id === 'mr1')!;
    expect(mr1.field).toMatchObject({
      reportedDays: 2,
      lateDays: 1,
      doctorCalls: 8,
      chemistCalls: 2,
      followups: 3,
      calls: 10,
      callsPerDay: 5,
      unconfirmed: 2,
    });
    expect(mr1.attendance).toEqual({ present: 1, leave: 1, absent: 1, strike: 0, off: 1 });
    expect(mr1).toMatchObject({ taPaise: 5000, daPaise: 3000, workingDays: 2 });
  });

  it('a person who reported nothing has zeros, not missing figures', async () => {
    const mr2 = (await build().read(base)).rows.find((r) => r.employee.id === 'mr2')!;
    expect(mr2.field).toMatchObject({
      reportedDays: 0,
      calls: 0,
      callsPerDay: null,
      unconfirmed: 0,
    });
  });

  it('never shows anyone outside the downline, whatever the company reported', async () => {
    const out = await build().read(base);
    expect(JSON.stringify(out)).not.toContain('stranger');
  });

  it('narrows to direct reports or deeper levels, and to one person', async () => {
    expect(
      (await build().read({ ...base, scope: 'direct' })).rows.map((r) => r.employee.id),
    ).toEqual(['asm']);
    expect(
      (await build().read({ ...base, scope: 'indirect' })).rows.map((r) => r.employee.id),
    ).toEqual(['mr1', 'mr2']);
    expect((await build().read({ ...base, userId: 'mr2' })).rows.map((r) => r.employee.id)).toEqual(
      ['mr2'],
    );
  });

  it('refuses a person outside the downline, and a manager with no team', async () => {
    await expect(build().read({ ...base, userId: 'someone' })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      build().read({ ...base, actor: { id: 'mr1', role: 'FIELD' } }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('reads a running month up to today and gives the month back', async () => {
    const out = await build().read(base);
    expect(out).toMatchObject({ month: '2026-10', from: '2026-10-01', to: '2026-10-09', total: 3 });
  });
});
