import type { FinalizeOutcomeDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { monthRange, parseCalendarMonth } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { ExpenseMonthRepositoryPort, ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DcrClock } from '../dcrClock.js';
import { EXPENSE_MONTH_KIND, expenseMonthStatusOf } from './expenseMonth.usecase.js';
import type { Actor } from './readDcrs.usecase.js';

/**
 * Finalizing closes an employee's month of expenses (decision-log 2026-10-13): after the manager's approval and HR's review, the Accountant
 * (or Admin) finalizes it. From then on its amounts cannot change, it cannot be sent back or reopened, and it can be paid, which only a
 * finalized month can be. Only an approved month can be finalized, and only once the month is over. For each employee the month's record
 * and its rows change together; one employee failing does not stop the rest.
 */
export class FinalizeExpenseMonthsUseCase {
  constructor(
    private readonly months: ExpenseMonthRepositoryPort,
    private readonly expenses: ExpenseRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly users: UserDirectoryPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly config: ConfigReader,
    private readonly clock: DcrClock,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: Actor, input: { month: string; userIds?: string[] | undefined }): Promise<FinalizeOutcomeDto[]> {
    if (actor.role !== 'ACCOUNTANT' && actor.role !== 'ADMIN') throw AppError.forbidden();
    parseCalendarMonth(input.month);
    const range = monthRange(input.month);
    if ((await this.clock.today()) <= range.to) throw AppError.conflict('The month is not over yet.', { code: 'MONTH_NOT_ENDED' });
    await assertFinancialYearOpen(this.config, range.from, `The expenses of ${input.month}`);
    if (input.userIds && input.userIds.length === 0) throw AppError.badRequest('Name at least one employee.', { field: 'userIds' });

    const userIds = input.userIds ? [...new Set(input.userIds)] : await this.users.listActiveFieldUserIds();
    const records = await this.months.listForUsers(userIds, input.month);
    const requests = await this.approvals.listForRecords(EXPENSE_MONTH_KIND, records.map((r) => r.id));
    const approved = new Set(requests.filter((r) => expenseMonthStatusOf(r) === 'APPROVED').map((r) => r.recordId));
    const recordOf = new Map(records.map((r) => [r.userId, r]));

    const out: FinalizeOutcomeDto[] = [];
    for (const userId of userIds) {
      const record = recordOf.get(userId);
      const isApproved = record !== undefined && approved.has(record.id);
      if (record?.finalizedAt) out.push({ userId, result: 'ALREADY_FINALIZED' });
      else if (!isApproved) {
        // Everyone-mode lists only what can be finalized; a named employee that cannot be is told why.
        if (input.userIds) out.push({ userId, result: 'NOT_APPROVED' });
      } else {
        const at = this.now();
        const done = await this.transactions.run(async (ctx) => {
          if (!(await this.months.finalize(userId, input.month, actor.id, at, ctx))) return false;
          await this.expenses.setMonthFinalized(userId, range, ctx);
          return true;
        });
        out.push({ userId, result: done ? 'FINALIZED' : 'ALREADY_FINALIZED' });
      }
    }
    return out;
  }
}
