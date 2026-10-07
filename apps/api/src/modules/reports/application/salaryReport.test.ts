import { describe, expect, it } from 'vitest';
import type { ExpenseMonthRow, PayrollReportRow } from '../domain/ports.js';
import { SalaryReport } from './salaryReport.js';

const run = (userId: string, month: string, status: PayrollReportRow['status'], over: Partial<PayrollReportRow> = {}): PayrollReportRow => ({
  runId: `run-${userId}-${month}`,
  userId,
  month,
  status,
  baseSalaryPaise: 3_000_000,
  leaveDeductionPaise: 0,
  absentDeductionPaise: 0,
  netPayablePaise: 3_000_000,
  employerContributionPaise: 360_000,
  ...over,
});
const spend = (userId: string, month: string, over: Partial<ExpenseMonthRow> = {}): ExpenseMonthRow => ({ userId, month, taPaise: 0, daPaise: 0, reimbursementPaise: 0, paidPaise: 0, unpaidPaise: 0, flaggedRows: 0, ...over });

function kit(runs: PayrollReportRow[], expenses: ExpenseMonthRow[] = []) {
  const calls: Array<Record<string, unknown>> = [];
  const report = new SalaryReport(
    { listRunsForReport: async (range) => (calls.push({ runs: range }), runs.filter((r) => r.month >= range.fromMonth && r.month <= range.toMonth)) },
    { summarizeDcrs: async () => [], listCalledDoctorIds: async () => [], listAcceptedExpenses: async () => [], summarizeExpenses: async (range) => (calls.push({ expenses: range }), expenses.filter((e) => e.month >= range.from.slice(0, 7) && e.month <= range.to.slice(0, 7))) },
    { getUserSummaries: async (ids) => ids.filter((id) => id === 'u1' || id === 'u2').map((id) => ({ id, name: id === 'u1' ? 'Asha Rao' : 'Bimal Das', employeeCode: id === 'u1' ? 'MR001' : 'MR002' })) },
    { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_START_MONTH: 'APRIL' })[key] ?? '' },
    () => new Date('2026-10-07T06:00:00Z'),
  );
  return { report, calls };
}

describe('the salary year', () => {
  it('twelve months from April: finalized runs are the figures, with net, employer contributions and cost to the company', async () => {
    const { report, calls } = kit([
      run('u1', '2026-04', 'FINALIZED', { leaveDeductionPaise: 100_000, absentDeductionPaise: 200_000, netPayablePaise: 2_700_000 }),
      run('u2', '2026-04', 'FINALIZED'),
    ]);
    const r = await report.year({ year: 2026 });
    expect(calls[0]).toEqual({ runs: { fromMonth: '2026-04', toMonth: '2027-03' } });
    expect(r.months).toHaveLength(12);
    expect(r.months[0]).toMatchObject({ month: '2026-04', state: 'FINAL', finalEmployees: 2, draftEmployees: 0, basePaise: 6_000_000, leaveDeductionPaise: 100_000, absentDeductionPaise: 200_000, netPaise: 5_700_000, employerPaise: 720_000, costToCompanyPaise: 6_420_000, draftNetPaise: 0 });
    expect(r.totals).toMatchObject({ netPaise: 5_700_000, costToCompanyPaise: 6_420_000 });
  });

  it('a draft month is reported as a draft: its net pay is apart, never in the figures or the totals', async () => {
    const r = await kit([run('u1', '2026-05', 'FINALIZED'), run('u1', '2026-09', 'DRAFT', { netPayablePaise: 2_900_000 }), run('u2', '2026-09', 'DRAFT'), run('u1', '2026-08', 'FINALIZED'), run('u2', '2026-08', 'DRAFT')]).report.year({ year: 2026 });
    const by = Object.fromEntries(r.months.map((m) => [m.month, m]));
    expect(by['2026-09']).toMatchObject({ state: 'DRAFT', finalEmployees: 0, draftEmployees: 2, netPaise: 0, costToCompanyPaise: 0, draftNetPaise: 5_900_000 });
    expect(by['2026-08']).toMatchObject({ state: 'PARTIAL', finalEmployees: 1, draftEmployees: 1, netPaise: 3_000_000, draftNetPaise: 3_000_000 });
    expect(r.totals.netPaise).toBe(6_000_000); // May and the finalized August run
  });

  it('marks a month that ended with no run, the month in progress, and the future', async () => {
    const r = await kit([run('u1', '2026-04', 'FINALIZED')]).report.year({ year: 2026 });
    expect(r.months.map((m) => m.state)).toEqual(['FINAL', 'NONE', 'NONE', 'NONE', 'NONE', 'NONE', 'OPEN', 'FUTURE', 'FUTURE', 'FUTURE', 'FUTURE', 'FUTURE']);
  });

  it('puts the month\'s accepted TA, DA and reimbursements beside the salary, even in a month with no run', async () => {
    const r = await kit([], [spend('u1', '2026-05', { taPaise: 10_000, daPaise: 20_000, reimbursementPaise: 3_000 }), spend('u2', '2026-05', { taPaise: 5_000, daPaise: 20_000 })]).report.year({ year: 2026 });
    expect(r.months[1]).toMatchObject({ month: '2026-05', taPaise: 15_000, daPaise: 40_000, reimbursementPaise: 3_000, netPaise: 0 });
  });

  it('lists every run, drafts included and marked, by month then name, with the run id for the slip; a removed employee shows as removed', async () => {
    const r = await kit([run('u2', '2026-04', 'FINALIZED'), run('u1', '2026-04', 'DRAFT'), run('gone', '2026-05', 'FINALIZED')]).report.year({ year: 2026 });
    expect(r.rows.map((x) => [x.month, x.user.name, x.status])).toEqual([['2026-04', 'Asha Rao', 'DRAFT'], ['2026-04', 'Bimal Das', 'FINALIZED'], ['2026-05', '(removed)', 'FINALIZED']]);
    expect(r.rows[0]).toMatchObject({ runId: 'run-u1-2026-04', user: { employeeCode: 'MR001' }, costToCompanyPaise: 3_360_000 });
  });

  it('an empty year is twelve empty months', async () => {
    const r = await kit([]).report.year({ year: 2026 });
    expect(r.rows).toEqual([]);
    expect(r.totals.netPaise).toBe(0);
  });
});
