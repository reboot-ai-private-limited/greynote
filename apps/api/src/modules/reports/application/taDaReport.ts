import type { TaDaDaysDto, TaDaFiguresDto, TaDaMonthDto, TaDaMrRowDto, TaDaYearReportDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertTimeZone, businessDate, leaveYearRange, monthRange, parseMonthName } from '@/shared/time/businessTime.js';
import { yearMonths } from '../domain/salesFigures.js';
import type { ExpenseMonthRow, FieldActivityPort, IdentityPort, TerritoryPort } from '../domain/ports.js';

/** The most expense rows a day-by-day list returns; a caller that gets this many knows there may be more. */
export const TADA_DAYS_LIMIT = 2000;

const UNKNOWN = '(removed)';
const empty = (): TaDaFiguresDto => ({ taPaise: 0, daPaise: 0, reimbursementPaise: 0, totalPaise: 0, paidPaise: 0, unpaidPaise: 0, flaggedRows: 0 });

const figures = (r: ExpenseMonthRow): TaDaFiguresDto => ({
  taPaise: r.taPaise,
  daPaise: r.daPaise,
  reimbursementPaise: r.reimbursementPaise,
  totalPaise: r.taPaise + r.daPaise + r.reimbursementPaise,
  paidPaise: r.paidPaise,
  unpaidPaise: r.unpaidPaise,
  flaggedRows: r.flaggedRows,
});

function add(into: TaDaFiguresDto, f: TaDaFiguresDto): void {
  into.taPaise += f.taPaise;
  into.daPaise += f.daPaise;
  into.reimbursementPaise += f.reimbursementPaise;
  into.totalPaise += f.totalPaise;
  into.paidPaise += f.paidPaise;
  into.unpaidPaise += f.unpaidPaise;
  into.flaggedRows += f.flaggedRows;
}

/**
 * What the field force claimed for travel and daily allowance, month by month for a financial year, and what of it is paid (sign-off K28). Only
 * accepted expenses count — the ones past the manager and not sent back, the same ones the Accountant audits and pays; cancelled ones never.
 * Paying is done on the Expense payouts screen: this report only reads.
 */
export class TaDaReport {
  constructor(
    private readonly fieldActivity: FieldActivityPort,
    private readonly territory: TerritoryPort,
    private readonly identity: IdentityPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async currentMonth(): Promise<string> {
    const zone = await readConfig(this.config, 'BUSINESS_TIMEZONE', (v) => {
      assertTimeZone(v);
      return v;
    });
    return businessDate(this.now(), zone).slice(0, 7);
  }

  async year(input: { year: number }): Promise<TaDaYearReportDto> {
    const startMonth = await readConfig(this.config, 'FY_START_MONTH', parseMonthName);
    const range = leaveYearRange(input.year, startMonth);
    const months = yearMonths(range.from);
    const [summaries, current] = await Promise.all([this.fieldActivity.summarizeExpenses(range), this.currentMonth()]);
    const people = await this.identity.getUserSummaries([...new Set(summaries.map((s) => s.userId))]);
    const who = new Map(people.map((p) => [p.id, p]));

    const rows: TaDaMrRowDto[] = summaries
      .map((s) => ({ month: s.month, mr: { id: s.userId, name: who.get(s.userId)?.name ?? UNKNOWN, employeeCode: who.get(s.userId)?.employeeCode ?? '' }, ...figures(s) }))
      .sort((a, b) => a.month.localeCompare(b.month) || a.mr.name.localeCompare(b.mr.name));

    const totals = empty();
    const monthRows: TaDaMonthDto[] = months.map((month) => {
      const f = empty();
      const inMonth = rows.filter((r) => r.month === month);
      for (const r of inMonth) add(f, r);
      add(totals, f);
      return { month, state: month > current ? 'FUTURE' : month === current ? 'OPEN' : 'ENDED', employees: inMonth.length, ...f };
    });
    return { year: input.year, months: monthRows, rows, totals };
  }

  async days(input: { userId: string; month: string }): Promise<TaDaDaysDto> {
    const [mr] = await this.identity.getUserSummaries([input.userId]);
    if (!mr) throw AppError.notFound();
    const { from, to } = monthRange(input.month);
    const expenses = await this.fieldActivity.listAcceptedExpenses({ from, to, userId: input.userId, limit: TADA_DAYS_LIMIT });
    const routeIds = [...new Set(expenses.flatMap((e) => (e.routeId ? [e.routeId] : [])))];
    const routes = new Map((await Promise.all(routeIds.map((id) => this.territory.getRoute(id)))).flatMap((r) => (r ? [[r.id, r.name] as const] : [])));
    const order = { TA: 0, DA: 1, TRAVEL: 2, MEAL: 3, MISC: 4, OTHER: 5 } as const;
    return {
      month: input.month,
      mr: { id: mr.id, name: mr.name, employeeCode: mr.employeeCode },
      rows: expenses
        .filter((e) => e.paymentStatus !== 'CANCELLED')
        .map((e) => ({
          date: e.reportDate,
          type: e.type,
          source: e.source,
          route: e.routeId ? { id: e.routeId, name: routes.get(e.routeId) ?? UNKNOWN } : null,
          amountPaise: e.amountPaise,
          status: e.paymentStatus === 'PAID' ? ('PAID' as const) : ('UNPAID' as const),
          paidAt: e.paidAt ? e.paidAt.toISOString() : null,
          distanceFlag: e.distanceFlag,
          remarks: e.remarks,
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]),
      truncated: expenses.length >= TADA_DAYS_LIMIT,
    };
  }
}
