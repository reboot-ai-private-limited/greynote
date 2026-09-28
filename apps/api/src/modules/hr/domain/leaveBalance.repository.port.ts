import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LeaveBalance } from './leaveBalance.entity.js';

export interface BalanceKey {
  userId: string;
  leaveTypeId: string;
  year: number;
}

export interface LeaveBalanceRepositoryPort {
  listForUser(userId: string, year: number): Promise<LeaveBalance[]>;
  find(key: BalanceKey): Promise<LeaveBalance | null>;
  /** Inserts the rows that don't exist yet; never touches an existing one. Safe to race. */
  insertMissing(rows: Array<BalanceKey & { allocatedDays: number }>): Promise<void>;
  /** HR's adjustment. `null` if it would fall below used + pending (or the row is gone). */
  setAllocated(key: BalanceKey, allocatedDays: number, by: string, reason: string): Promise<LeaveBalance | null>;
  existsForLeaveType(leaveTypeId: string): Promise<boolean>;

  // The ledger (LLD hr.md) — each inside the transaction of the event that causes it.
  /** pending += days, only if available ≥ days. False when there isn't enough. */
  reserve(key: BalanceKey, days: number, ctx: TransactionContext): Promise<boolean>;
  /** pending −= days (rejected / withdrawn, or a resubmit replacing the old reservation). */
  release(key: BalanceKey, days: number, ctx: TransactionContext): Promise<void>;
  /** pending −= days, used += days (finally approved). */
  consume(key: BalanceKey, days: number, ctx: TransactionContext): Promise<void>;
  /** used −= days (an approved leave reopened). */
  giveBack(key: BalanceKey, days: number, ctx: TransactionContext): Promise<void>;
}
