import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { StockStatus } from './monthlyStock.entity.js';
import type { SecondaryRollup, SecondaryRollupInput } from './secondaryRollup.entity.js';

export interface SecondaryRollupRangeFilter {
  fromMonth: string;
  toMonth: string;
  userIds?: readonly string[] | undefined;
  /** Absent means APPROVED only (a report's read). */
  statuses?: readonly StockStatus[] | undefined;
}

export interface SecondaryRollupRepositoryPort {
  /** One snapshot per manager and month: a second save replaces it. */
  save(rollup: SecondaryRollupInput, ctx?: TransactionContext): Promise<void>;
  find(userId: string, month: string): Promise<SecondaryRollup | null>;
  listRange(filter: SecondaryRollupRangeFilter, limit: number): Promise<SecondaryRollup[]>;
  /** Moves the manager's snapshot for a month between statuses; `approvedAt` is set when given. Returns how many changed. */
  setStatus(filter: { userId: string; month: string }, from: readonly StockStatus[], to: StockStatus, approvedAt?: Date | null, ctx?: TransactionContext): Promise<number>;
  deleteByUser(userId: string, month: string, ctx?: TransactionContext): Promise<number>;
}
