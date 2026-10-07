import { describe, expect, it } from 'vitest';
import type { ExpenseMonthRow, ExpenseRecord } from '../domain/ports.js';
import { TADA_DAYS_LIMIT, TaDaReport } from './taDaReport.js';

const sum = (userId: string, month: string, over: Partial<ExpenseMonthRow> = {}): ExpenseMonthRow => ({ userId, month, taPaise: 0, daPaise: 0, reimbursementPaise: 0, paidPaise: 0, unpaidPaise: 0, flaggedRows: 0, ...over });
const exp = (over: Partial<ExpenseRecord> & { id: string }): ExpenseRecord => ({ userId: 'u1', reportDate: '2026-05-04', routeId: null, type: 'TA', source: 'AUTO', amountPaise: 10_000, remarks: null, paymentStatus: 'UNPAID', distanceFlag: false, paidAt: null, ...over });

function kit(summaries: ExpenseMonthRow[], expenses: ExpenseRecord[] = []) {
  const calls: Array<Record<string, unknown>> = [];
  const report = new TaDaReport(
    {
      summarizeExpenses: async (range) => (calls.push({ summarize: range }), summaries.filter((s) => s.month >= range.from.slice(0, 7) && s.month <= range.to.slice(0, 7))),
      listAcceptedExpenses: async (f) => (calls.push({ list: f }), expenses.filter((e) => e.reportDate >= f.from && e.reportDate <= f.to && (!f.userId || e.userId === f.userId))),
    },
    { getRoute: async (id) => (id === 'r1' ? { id, name: 'Siliguri Naxalbari' } : null) },
    { getUserSummaries: async (ids) => ids.filter((id) => id === 'u1' || id === 'u2').map((id) => ({ id, name: id === 'u1' ? 'Asha Rao' : 'Bimal Das', employeeCode: id === 'u1' ? 'MR001' : 'MR002' })) },
    { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_START_MONTH: 'APRIL' })[key] ?? '' },
    () => new Date('2026-10-07T06:00:00Z'),
  );
  return { report, calls };
}

describe('the TA/DA year', () => {
  it('twelve months from April with each employee\'s month, the totals adding up, and the open and future months marked', async () => {
    const { report, calls } = kit([
      sum('u1', '2026-04', { taPaise: 30_000, daPaise: 20_000, reimbursementPaise: 5_000, paidPaise: 55_000 }),
      sum('u2', '2026-04', { taPaise: 10_000, daPaise: 10_000, unpaidPaise: 20_000, flaggedRows: 1 }),
      sum('u1', '2026-10', { taPaise: 8_000, unpaidPaise: 8_000 }),
    ]);
    const r = await report.year({ year: 2026 });
    expect(calls[0]).toEqual({ summarize: { from: '2026-04-01', to: '2027-03-31' } });
    expect(r.months).toHaveLength(12);
    expect(r.months[0]).toMatchObject({ month: '2026-04', state: 'ENDED', employees: 2, taPaise: 40_000, daPaise: 30_000, reimbursementPaise: 5_000, totalPaise: 75_000, paidPaise: 55_000, unpaidPaise: 20_000, flaggedRows: 1 });
    expect(r.months[6]).toMatchObject({ month: '2026-10', state: 'OPEN', employees: 1, totalPaise: 8_000 });
    expect(r.months[7]).toMatchObject({ state: 'FUTURE', employees: 0, totalPaise: 0 });
    expect(r.totals).toMatchObject({ totalPaise: 83_000, paidPaise: 55_000, unpaidPaise: 28_000 });
    expect(r.totals.totalPaise).toBe(r.totals.paidPaise + r.totals.unpaidPaise);
    expect(r.rows.map((x) => [x.month, x.mr.name])).toEqual([['2026-04', 'Asha Rao'], ['2026-04', 'Bimal Das'], ['2026-10', 'Asha Rao']]);
    expect(r.rows[0]).toMatchObject({ mr: { employeeCode: 'MR001' }, totalPaise: 55_000 });
  });

  it('a removed employee shows as removed; a year with no claims is twelve empty months', async () => {
    expect((await kit([sum('gone', '2026-05', { taPaise: 1 })]).report.year({ year: 2026 })).rows[0]!.mr.name).toBe('(removed)');
    const empty = await kit([]).report.year({ year: 2026 });
    expect(empty.rows).toEqual([]);
    expect(empty.months.every((m) => m.totalPaise === 0)).toBe(true);
  });
});

describe('the TA/DA days', () => {
  it('lists one employee\'s accepted rows for the month in date order, TA before DA, with route names, leaving cancelled out', async () => {
    const { report, calls } = kit([], [
      exp({ id: 'a', reportDate: '2026-05-06', type: 'DA', amountPaise: 20_000 }),
      exp({ id: 'b', reportDate: '2026-05-04', type: 'DA', amountPaise: 20_000, paymentStatus: 'PAID', paidAt: new Date('2026-06-15T05:00:00Z') }),
      exp({ id: 'c', reportDate: '2026-05-04', type: 'TA', routeId: 'r1', amountPaise: 9_000, distanceFlag: true }),
      exp({ id: 'd', reportDate: '2026-05-05', type: 'MEAL', source: 'MANUAL', amountPaise: 3_000, remarks: 'lunch' }),
      exp({ id: 'x', reportDate: '2026-05-07', paymentStatus: 'CANCELLED' }),
      exp({ id: 'other', userId: 'u2', reportDate: '2026-05-04' }),
      exp({ id: 'old', reportDate: '2026-04-30' }),
    ]);
    const r = await report.days({ userId: 'u1', month: '2026-05' });
    expect(calls[0]).toEqual({ list: { from: '2026-05-01', to: '2026-05-31', userId: 'u1', limit: TADA_DAYS_LIMIT } });
    expect(r.mr).toEqual({ id: 'u1', name: 'Asha Rao', employeeCode: 'MR001' });
    expect(r.rows.map((x) => [x.date, x.type, x.status])).toEqual([['2026-05-04', 'TA', 'UNPAID'], ['2026-05-04', 'DA', 'PAID'], ['2026-05-05', 'MEAL', 'UNPAID'], ['2026-05-06', 'DA', 'UNPAID']]);
    expect(r.rows[0]).toMatchObject({ route: { name: 'Siliguri Naxalbari' }, distanceFlag: true });
    expect(r.rows[1]).toMatchObject({ paidAt: '2026-06-15T05:00:00.000Z' });
    expect(r.rows[2]).toMatchObject({ source: 'MANUAL', remarks: 'lunch', route: null });
    expect(r.truncated).toBe(false);
  });

  it('an unknown employee is a 404, and a full list says it may be short', async () => {
    await expect(kit([]).report.days({ userId: 'nobody', month: '2026-05' })).rejects.toMatchObject({ statusCode: 404 });
    const many = Array.from({ length: TADA_DAYS_LIMIT }, (_, i) => exp({ id: `e${i}` }));
    expect((await kit([], many).report.days({ userId: 'u1', month: '2026-05' })).truncated).toBe(true);
  });
});
