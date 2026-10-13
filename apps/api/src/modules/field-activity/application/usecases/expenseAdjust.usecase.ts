import { AppError } from '@/shared/errors/AppError.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { monthRange } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { ExpenseAdjustment, ExpenseAdjustmentRepositoryPort } from '../../domain/expenseAdjustment.entity.js';
import type { Expense } from '../../domain/expense.entity.js';
import type { ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DcrClock } from '../dcrClock.js';
import type { Actor } from './readDcrs.usecase.js';

/** HR reviews and edits, the Accountant finalizes and pays, Admin does everything (decision-log 2026-10-13). */
const assertEditor = (actor: Actor) => {
  if (actor.role !== 'ADMIN' && actor.role !== 'HR') throw AppError.forbidden();
};

/**
 * HR's changes to a month of expenses: raise or lower an existing row (TA, DA or another claim), or put a TA or DA amount on a day that had
 * none. A reason is required and every change is logged (before, after, who, when); the row keeps the first amount it ever held. Paid
 * rows cannot change, and nothing changes in a closed financial year. The employee's own claim is never rewritten: only the amount.
 */
export class AdjustExpenseService {
  constructor(
    private readonly expenses: ExpenseRepositoryPort,
    private readonly adjustments: ExpenseAdjustmentRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly config: ConfigReader,
    private readonly clock: DcrClock,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async editRow(actor: Actor, rowId: string, input: { amountPaise: number; reason: string }): Promise<ExpenseAdjustment> {
    assertEditor(actor);
    const row = await this.expenses.findById(rowId);
    if (!row || row.paymentStatus === 'CANCELLED') throw AppError.notFound('No such expense.');
    if (row.paymentStatus === 'PAID') throw AppError.conflict('This amount has already been paid, so it can no longer be changed.', { code: 'EXPENSE_PAID' });
    if (row.monthFinalized) throw AppError.conflict('This month has been finalized, so its amounts can no longer be changed.', { code: 'EXPENSE_MONTH_FINALIZED' });
    if (input.amountPaise === row.amountPaise) throw AppError.badRequest('That is the amount it already has.', { field: 'amountPaise' });
    await assertFinancialYearOpen(this.config, row.reportDate, `The expenses of ${row.reportDate}`);
    const before = row.amountPaise;
    const original = row.originalAmountPaise ?? row.amountPaise;
    return this.transactions.run(async (ctx) => {
      const changed = await this.expenses.adjustAmount(row.id, before, input.amountPaise, original, ctx);
      if (!changed) throw AppError.conflict('This amount was paid or changed just now. Reload and try again.', { code: 'EXPENSE_CHANGED' });
      return this.adjustments.create(this.entry(actor, row, 'EDIT', before, input.amountPaise, input.reason), ctx);
    });
  }

  async addRow(actor: Actor, input: { userId: string; date: string; type: 'TA' | 'DA'; amountPaise: number; reason: string }): Promise<ExpenseAdjustment> {
    assertEditor(actor);
    const person = await this.users.findUserSummary(input.userId);
    if (!person || person.role !== 'FIELD') throw AppError.notFound('No such employee.');
    if (input.date > (await this.clock.today())) throw AppError.badRequest('A day that has not happened yet cannot have an expense.', { field: 'date' });
    await assertFinancialYearOpen(this.config, input.date, `The expenses of ${input.date}`);
    const month = input.date.slice(0, 7);
    const sameDay = (await this.expenses.listForUserRange(input.userId, { from: input.date, to: input.date })).filter((r) => r.type === input.type);
    if (sameDay.length > 0) throw AppError.conflict(`That day already has ${input.type}. Change it instead of adding another.`, { code: 'EXPENSE_EXISTS' });
    // Part of the statement from the start: payable once its month is (or already is) approved.
    const monthRows = await this.expenses.listForUserRange(input.userId, monthRange(month));
    if (monthRows.some((r) => r.monthFinalized)) throw AppError.conflict('This month has been finalized, so its amounts can no longer be changed.', { code: 'EXPENSE_MONTH_FINALIZED' });
    const monthApproved = monthRows.some((r) => r.monthApproved);
    return this.transactions.run(async (ctx) => {
      const row = await this.expenses.create(
        { dcrId: null, userId: input.userId, reportDate: input.date, routeId: null, type: input.type, source: 'MANUAL', amountPaise: input.amountPaise, remarks: null, paymentStatus: 'UNPAID', accepted: true, monthApproved, distanceFlag: false, paidBy: null, paidAt: null, clientId: null, recordedAt: this.now(), originalAmountPaise: 0 },
        ctx,
      );
      return this.adjustments.create(this.entry(actor, row, 'ADD', 0, input.amountPaise, input.reason), ctx);
    });
  }

  private entry(actor: Actor, row: Expense, kind: 'EDIT' | 'ADD', beforePaise: number, afterPaise: number, reason: string): Omit<ExpenseAdjustment, 'id'> {
    return { userId: row.userId, month: row.reportDate.slice(0, 7), reportDate: row.reportDate, expenseId: row.id, type: row.type, kind, beforePaise, afterPaise, reason, by: actor.id, byRole: actor.role, at: this.now() };
  }
}
