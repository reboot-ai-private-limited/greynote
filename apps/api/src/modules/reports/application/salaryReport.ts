import type { SalaryFiguresDto, SalaryMonthDto, SalaryRowDto, SalaryYearReportDto } from '@greynote/contracts';
import { readBusinessDay, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { businessDate, leaveYearRange, parseMonthName } from '@/shared/time/businessTime.js';
import { yearMonths } from '../domain/salesFigures.js';
import type { FieldActivityPort, IdentityPort, PayrollPort, PayrollReportRow } from '../domain/ports.js';

const UNKNOWN = '(removed)';
const empty = (): SalaryFiguresDto => ({ basePaise: 0, leaveDeductionPaise: 0, absentDeductionPaise: 0, netPaise: 0, employerPaise: 0, costToCompanyPaise: 0 });

const figuresOf = (r: PayrollReportRow): SalaryFiguresDto => ({
  basePaise: r.baseSalaryPaise,
  leaveDeductionPaise: r.leaveDeductionPaise,
  absentDeductionPaise: r.absentDeductionPaise,
  netPaise: r.netPayablePaise,
  employerPaise: r.employerContributionPaise,
  costToCompanyPaise: r.netPayablePaise + r.employerContributionPaise,
});

function add(into: SalaryFiguresDto, f: SalaryFiguresDto): void {
  into.basePaise += f.basePaise;
  into.leaveDeductionPaise += f.leaveDeductionPaise;
  into.absentDeductionPaise += f.absentDeductionPaise;
  into.netPaise += f.netPaise;
  into.employerPaise += f.employerPaise;
  into.costToCompanyPaise += f.costToCompanyPaise;
}

/**
 * What salary was paid, month by month, for a financial year (sign-off K30): each employee's net pay, the month's base, deductions, net, the employer's
 * contributions and the cost to the company, beside the month's accepted TA, DA and reimbursements. Finalized runs are the figures; a month of drafts is
 * reported as a draft and its net pay shown apart, never added in. Reads only; the payroll screen is where a run is generated and finalized.
 */
export class SalaryReport {
  constructor(
    private readonly payroll: PayrollPort,
    private readonly fieldActivity: FieldActivityPort,
    private readonly identity: IdentityPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async currentMonth(): Promise<string> {
    const { timeZone: zone, dayStart } = await readBusinessDay(this.config);
    return businessDate(this.now(), zone, dayStart).slice(0, 7);
  }

  async year(input: { year: number }): Promise<SalaryYearReportDto> {
    const startMonth = await readConfig(this.config, 'FY_START_MONTH', parseMonthName);
    const range = leaveYearRange(input.year, startMonth);
    const months = yearMonths(range.from);
    const [runs, expenses, current] = await Promise.all([this.payroll.listRunsForReport({ fromMonth: months[0]!, toMonth: months[11]! }), this.fieldActivity.summarizeExpenses(range), this.currentMonth()]);
    const people = await this.identity.getUserSummaries([...new Set(runs.map((r) => r.userId))]);
    const who = new Map(people.map((p) => [p.id, p]));

    const rows: SalaryRowDto[] = runs
      .map((r) => ({ month: r.month, user: { id: r.userId, name: who.get(r.userId)?.name ?? UNKNOWN, employeeCode: who.get(r.userId)?.employeeCode ?? '' }, status: r.status, runId: r.runId, ...figuresOf(r) }))
      .sort((a, b) => a.month.localeCompare(b.month) || a.user.name.localeCompare(b.user.name));

    const totals = empty();
    const monthRows: SalaryMonthDto[] = months.map((month) => {
      const inMonth = runs.filter((r) => r.month === month);
      const final = inMonth.filter((r) => r.status === 'FINALIZED');
      const draft = inMonth.filter((r) => r.status === 'DRAFT');
      const f = empty();
      for (const r of final) add(f, figuresOf(r));
      add(totals, f);
      const spent = expenses.filter((e) => e.month === month);
      const state: SalaryMonthDto['state'] = month > current ? 'FUTURE' : month === current ? 'OPEN' : inMonth.length === 0 ? 'NONE' : draft.length === 0 ? 'FINAL' : final.length === 0 ? 'DRAFT' : 'PARTIAL';
      return {
        month,
        state,
        finalEmployees: final.length,
        draftEmployees: draft.length,
        draftNetPaise: draft.reduce((n, r) => n + r.netPayablePaise, 0),
        taPaise: spent.reduce((n, e) => n + e.taPaise, 0),
        daPaise: spent.reduce((n, e) => n + e.daPaise, 0),
        reimbursementPaise: spent.reduce((n, e) => n + e.reimbursementPaise, 0),
        ...f,
      };
    });
    return { year: input.year, months: monthRows, rows, totals };
  }
}
