import { AppError } from '@/shared/errors/AppError.js';
import { readBusinessDay, type ConfigReader } from '@/shared/config/readConfig.js';
import { businessDate, monthRange } from '@/shared/time/businessTime.js';
import type { ExpenseStatementPort, FieldActivityPort, FieldRosterPort, IdentityPort, TerritoryPort } from '../domain/ports.js';

export interface EmployeeExpenseInput {
  actor: { id: string; role: string };
  userId: string;
  /** `YYYY-MM`; left out, the month that holds today. */
  month?: string | undefined;
}

export interface ExpenseDay {
  date: string;
  route: string;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  /** The employee's own claims for the day, with their notes. */
  notes: string;
  /** `Paid`, `Part paid`, `Unpaid` (payable, not paid) or `` (not payable yet: the month is not approved). */
  payment: string;
  /** A route's distance could not be worked out, so the TA is low. */
  flagged: boolean;
}

export interface EmployeeExpenseModel {
  employee: { id: string; name: string; employeeCode: string; designation: string | null };
  month: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  paidPaise: number;
  totals: { taPaise: number; daPaise: number; otherPaise: number; totalPaise: number };
  days: ExpenseDay[];
}

/** One employee's expense month (decision-log 2026-11-18): each day's route, TA, DA and own claims, the month's state and what is paid. Reads only. */
export class EmployeeExpenseReport {
  constructor(
    private readonly expenses: ExpenseStatementPort & Pick<FieldActivityPort, 'listAcceptedExpenses'>,
    private readonly territory: TerritoryPort,
    private readonly identity: IdentityPort & FieldRosterPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(input: EmployeeExpenseInput): Promise<EmployeeExpenseModel> {
    await this.assertMayRead(input.actor, input.userId);
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    const month = input.month ?? businessDate(this.now(), timeZone, dayStart).slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw AppError.badRequest('Use a month like 2026-11.');
    const range = monthRange(month);
    const [who] = await this.identity.listFieldEmployees([input.userId]);
    const [summary] = who ? [] : await this.identity.getUserSummaries([input.userId]);
    if (!who && !summary) throw AppError.notFound('No such employee.');

    const [statement, accepted] = await Promise.all([this.expenses.getExpenseStatement(input.userId, month), this.expenses.listAcceptedExpenses({ from: range.from, to: range.to, userId: input.userId, limit: 5000 })]);
    const routeIds = [...new Set(accepted.flatMap((e) => (e.routeId ? [e.routeId] : [])))];
    const routeName = new Map(await Promise.all(routeIds.map(async (id) => [id, (await this.territory.getRoute(id))?.name ?? 'Route'] as const)));
    const rowsOn = (date: string) => accepted.filter((e) => e.reportDate === date);

    const days = statement.days
      .filter((d) => d.totalPaise > 0 || d.others.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d): ExpenseDay => {
        const rows = rowsOn(d.date);
        const paid = rows.filter((e) => e.paymentStatus === 'PAID').length;
        return {
          date: d.date,
          route: [...new Set(rows.flatMap((e) => (e.routeId ? [routeName.get(e.routeId) ?? 'Route'] : [])))].join(', '),
          taPaise: d.taPaise,
          daPaise: d.daPaise,
          otherPaise: d.otherPaise,
          totalPaise: d.totalPaise,
          notes: d.others.map((o) => o.remarks ?? '').filter(Boolean).join('; '),
          payment: statement.status !== 'APPROVED' || rows.length === 0 ? '' : paid === rows.length ? 'Paid' : paid > 0 ? 'Part paid' : 'Unpaid',
          flagged: rows.some((e) => e.distanceFlag),
        };
      });
    return { employee: { id: input.userId, name: who?.name ?? summary!.name, employeeCode: who?.employeeCode ?? summary!.employeeCode, designation: who?.designation ?? null }, month, status: statement.status, paidPaise: statement.paidPaise, totals: statement.totals, days };
  }

  private async assertMayRead(actor: { id: string; role: string }, userId: string): Promise<void> {
    if (actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT' || actor.role === 'HR' || actor.id === userId) return;
    if (actor.role === 'FIELD' && (await this.identity.getDownline(actor.id)).some((u) => u.id === userId)) return;
    throw AppError.forbidden('You can only download your own report and your team\'s.');
  }
}
