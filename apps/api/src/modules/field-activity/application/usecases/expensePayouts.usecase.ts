import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { AppError } from '@/shared/errors/AppError.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import { parseCalendarMonth } from '@/shared/time/businessTime.js';
import type { DcrClock } from '../dcrClock.js';
import type { ExpenseBucket, ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

export interface ExpensePayoutRow {
  userId: string;
  userName: string;
  employeeCode: string;
  unpaid: ExpenseBucket;
  paid: ExpenseBucket;
  lastPaidAt: Date | null;
}
export interface ExpensePayoutSheet {
  /** The month the expenses were incurred in (`YYYY-MM`, by report day). */
  month: string;
  /** The day they are due to be paid: `EXPENSE_PAYOUT_DAY` of the next month. */
  dueDate: string;
  /** Something is still unpaid and the due day has passed. A flag for the Accountant, never a refusal. */
  overdue: boolean;
  rows: ExpensePayoutRow[];
}

const parseDay = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1 || n > 28) throw new RangeError(`Not a day from 1 to 28: ${value}`);
  return n;
};

/** First and last report day of a month, as strings that compare like dates. */
const monthRange = (month: string) => {
  parseCalendarMonth(month);
  return { from: `${month}-01`, to: `${month}-31` };
};

const dueDateOf = (month: string, day: number): string => {
  const { year, month: m } = parseCalendarMonth(month);
  const [y, mm] = m === 12 ? [year + 1, 1] : [year, m + 1];
  return `${String(y).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const hasUnpaid = (b: ExpenseBucket) => b.count > 0;

/**
 * The expense payout (decision-log 2026-10-06): TA, DA and the manual reimbursements of one month, per employee, paid on the
 * `EXPENSE_PAYOUT_DAY` of the next month — apart from salary. A month is the month the expense was *incurred* (its report day),
 * and only accepted claims count. One statement per employee: what is still unpaid and what was paid.
 */
export class ListExpensePayoutsUseCase {
  constructor(
    private readonly expenses: ExpenseRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
    private readonly clock: DcrClock,
  ) {}

  async execute(month: string): Promise<ExpensePayoutSheet> {
    const statements = await this.expenses.statementsForRange(monthRange(month));
    const people = new Map((await this.users.getUserSummaries(statements.map((s) => s.userId))).map((u) => [u.id, u]));
    const rows = statements
      .map((s) => ({ ...s, userName: people.get(s.userId)?.name ?? '', employeeCode: people.get(s.userId)?.employeeCode ?? '' }))
      // Unpaid first, then by name.
      .sort((a, b) => Number(hasUnpaid(b.unpaid)) - Number(hasUnpaid(a.unpaid)) || a.userName.localeCompare(b.userName));
    const dueDate = dueDateOf(month, await readConfig(this.config, 'EXPENSE_PAYOUT_DAY', parseDay));
    return { month, dueDate, overdue: rows.some((r) => hasUnpaid(r.unpaid)) && (await this.clock.today()) > dueDate, rows };
  }
}

export type PayOutcome = { userId: string; paidCount: number; paidPaise: number };

/**
 * Pays a month's expenses: for each named employee (or everyone with something unpaid), every accepted, unpaid expense of
 * the month becomes `PAID` with who and when — one conditional update each, so a second press, or a retry, pays nothing twice
 * and moves no date. Paying early or late is allowed; the day is only a flag.
 */
export class PayMonthExpensesUseCase {
  constructor(
    private readonly expenses: ExpenseRepositoryPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(accountantId: string, input: { month: string; userIds?: string[] | undefined }): Promise<PayOutcome[]> {
    const range = monthRange(input.month);
    await assertFinancialYearOpen(this.config, range.from, `The expenses of ${input.month}`);
    const statements = await this.expenses.statementsForRange(range);
    const owed = new Map(statements.filter((s) => hasUnpaid(s.unpaid)).map((s) => [s.userId, s.unpaid]));
    const ids = input.userIds ? [...new Set(input.userIds)] : [...owed.keys()];
    if (input.userIds && ids.length === 0) throw AppError.badRequest('Name at least one employee.', { field: 'userIds' });
    const out: PayOutcome[] = [];
    for (const userId of ids) {
      const before = owed.get(userId);
      const paidCount = before ? await this.expenses.payAllForUser(userId, range, accountantId, this.now()) : 0;
      out.push({ userId, paidCount, paidPaise: before ? before.taPaise + before.daPaise + before.reimbursementPaise : 0 });
    }
    return out;
  }
}
