import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ExpenseGrantPhase, ExpenseMonthGrant } from './expenseMonthGrant.entity.js';

export interface ExpenseMonthGrantFilter {
  /** Only these employees' grants; absent = everyone. */
  userIds?: string[];
}

export interface ExpenseMonthGrantRepositoryPort {
  findById(id: string): Promise<ExpenseMonthGrant | null>;
  /** The usable grant for this month and phase: `OPEN` and not yet expired at `now`. */
  findUsable(userId: string, month: string, phase: ExpenseGrantPhase, now: Date): Promise<ExpenseMonthGrant | null>;
  /** Closes any expired `OPEN` grant for the same month and phase, then inserts. `null` if a usable one already exists. */
  create(input: Omit<ExpenseMonthGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date): Promise<ExpenseMonthGrant | null>;
  /** Inside the submit / approval transaction; false if it was used, revoked or expired meanwhile. */
  consume(id: string, now: Date, ctx: TransactionContext): Promise<boolean>;
  /** `null` if it was no longer usable. */
  revoke(id: string, revokedBy: string, now: Date): Promise<ExpenseMonthGrant | null>;
  /** Newest first. */
  list(filter: ExpenseMonthGrantFilter, page: { page: number; pageSize: number }): Promise<{ items: ExpenseMonthGrant[]; total: number }>;
}
