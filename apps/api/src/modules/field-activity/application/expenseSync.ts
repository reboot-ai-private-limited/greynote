import type { SyncHandlerDefinition } from '@/modules/sync/sync.public.js';
import type { Paise } from '@/shared/money/paise.js';
import type { ManualExpenseType } from '../domain/expense.entity.js';
import { recordHandler } from './callsSync.js';
import type { LogExpenseUseCase } from './usecases/logExpense.usecase.js';

/** The record kind the phone sends for a manual expense (LLD sync.md, *The kinds registered so far*). */
export const EXPENSE_SYNC_KIND = 'EXPENSE';

export function makeExpenseSyncHandler(logExpense: LogExpenseUseCase, parse: (payload: unknown) => { reportDate: string; type: ManualExpenseType; amountPaise: Paise; remarks: string | null }): SyncHandlerDefinition {
  return recordHandler(EXPENSE_SYNC_KIND, parse, (rec, input, ctx) => logExpense.execute(rec, input, ctx as never));
}
