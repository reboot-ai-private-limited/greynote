import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Paise } from '@/shared/money/paise.js';
import type { ManualExpenseType } from '../../domain/expense.entity.js';
import type { ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { LoggingGate } from '../loggingGate.js';
import type { RecordContext } from './logCalls.usecase.js';

/**
 * A manual expense (LLD field-activity.md, *Expenses*): travel, a meal or something else the MR paid for, on the
 * day's DCR, through the same gate as every record of the day. It is `UNPAID` from the start; whether it is
 * paid is the Accountant's later step, separate from the DCR's approval. TA and DA are never accepted here.
 */
export class LogExpenseUseCase {
  constructor(
    private readonly gate: LoggingGate,
    private readonly expenses: ExpenseRepositoryPort,
  ) {}

  async execute(rec: RecordContext, input: { reportDate: string; type: ManualExpenseType; amountPaise: Paise; remarks: string | null }, ctx: TransactionContext): Promise<{ serverId: string }> {
    const dcr = await this.gate.open(rec.userId, input.reportDate, rec.recordedAt);
    const expense = await this.expenses.create(
      { dcrId: dcr.id, userId: rec.userId, reportDate: input.reportDate, routeId: null, type: input.type, source: 'MANUAL', amountPaise: input.amountPaise, remarks: input.remarks, paymentStatus: 'UNPAID', distanceFlag: false, paidBy: null, paidAt: null, clientId: rec.clientId, recordedAt: rec.recordedAt },
      ctx,
    );
    return { serverId: expense.id };
  }
}
