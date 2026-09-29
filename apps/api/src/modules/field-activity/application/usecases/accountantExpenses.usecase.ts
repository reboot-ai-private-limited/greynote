import { AppError } from '@/shared/errors/AppError.js';
import type { Paise } from '@/shared/money/paise.js';
import type { Expense } from '../../domain/expense.entity.js';
import type { ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

export interface ExpenseAuditRow extends Expense {
  userName: string;
  employeeCode: string;
}

const AUDIT_LIMIT = 500;

/**
 * The Accountant's audit list (LLD field-activity.md, *Accountant*): the expenses whose DCR is past the manager
 * and hasn't been sent back — TA/DA the server computed and the MR's own claims — unpaid first, oldest day first.
 * A row's `distanceFlag` says a Route's distance couldn't be calculated, so an artificially low TA isn't mistaken
 * for a short Route. A range is required so the list is a working page, not the whole ledger.
 */
export class ListExpensesUseCase {
  constructor(
    private readonly expenses: ExpenseRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(filter: { from: string; to: string; userId?: string | undefined; paymentStatus?: 'UNPAID' | 'PAID' | undefined }): Promise<ExpenseAuditRow[]> {
    const rows = await this.expenses.listAccepted({ from: filter.from, to: filter.to, ...(filter.userId && { userId: filter.userId }), ...(filter.paymentStatus && { paymentStatus: filter.paymentStatus }) }, AUDIT_LIMIT);
    const people = new Map((await this.users.getUserSummaries([...new Set(rows.map((r) => r.userId))])).map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, userName: people.get(r.userId)?.name ?? '', employeeCode: people.get(r.userId)?.employeeCode ?? '' }));
  }
}

/**
 * The settlement step, independent of the DCR's approval: an accepted, unpaid expense becomes `PAID` with who and
 * when, in one conditional update. Marking a paid one again is harmless — it returns as it was, `paidBy` and
 * `paidAt` unchanged — so a double click or a retry can't move the date. A row whose DCR isn't past the manager,
 * or was sent back (unpaid AUTO rows are then `CANCELLED`), is a 409: nothing is owed yet, or any more.
 */
export class MarkExpensePaidUseCase {
  constructor(
    private readonly expenses: ExpenseRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(accountantId: string, id: string): Promise<Expense> {
    const expense = await this.expenses.findById(id);
    if (!expense) throw AppError.notFound('No such expense.');
    if (await this.expenses.markPaid(id, accountantId, this.now())) return (await this.expenses.findById(id))!;
    const current = (await this.expenses.findById(id))!;
    if (current.paymentStatus === 'PAID') return current;
    if (current.paymentStatus === 'CANCELLED') throw AppError.conflict('This expense was cancelled when its report was sent back, so there is nothing to pay.');
    throw AppError.conflict('This expense’s report has not been approved by the manager, so it cannot be paid yet.');
  }
}

/** Payroll's question: the whole paise of TA and DA `PAID` for this user's days in a month (`YYYY-MM`). Manual reimbursements are not in it. */
export class GetPaidTaDaTotalUseCase {
  constructor(private readonly expenses: ExpenseRepositoryPort) {}

  async execute(userId: string, month: string): Promise<{ taPaise: Paise; daPaise: Paise }> {
    return this.expenses.paidTaDaTotals(userId, month);
  }
}
