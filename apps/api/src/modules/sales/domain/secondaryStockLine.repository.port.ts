import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { StockStatus } from './monthlyStock.entity.js';
import type { SecondaryStockLine, SecondaryStockLineEdit, SecondaryStockLineInput } from './secondaryStockLine.entity.js';

export interface SecondaryStockRangeFilter {
  fromMonth: string;
  toMonth: string;
  userIds?: readonly string[] | undefined;
  distributorId?: string | undefined;
  productId?: string | undefined;
  /** Only lines with these statuses; absent means APPROVED only (a report's read). */
  statuses?: readonly StockStatus[] | undefined;
}

export interface SecondaryStockLineRepositoryPort {
  /** One row per user + distributor + product + month: a second write overwrites the figures and sets `status`. */
  upsertMany(userId: string, month: string, lines: readonly SecondaryStockLineInput[], status: StockStatus, at: Date, ctx?: TransactionContext): Promise<void>;
  /** Overwrites the figures of lines that are still PENDING and records who changed them; returns how many changed. Other statuses are left alone. */
  applyEdits(userId: string, month: string, edits: readonly SecondaryStockLineEdit[], ctx?: TransactionContext): Promise<number>;
  listByUser(userId: string, month: string): Promise<SecondaryStockLine[]>;
  /** Lines over a range of months; APPROVED only unless `statuses` says otherwise. */
  listRange(filter: SecondaryStockRangeFilter, limit: number): Promise<SecondaryStockLine[]>;
  /** Moves a user's lines for a month between statuses; returns how many changed. */
  setStatus(filter: { userId: string; month: string }, from: readonly StockStatus[], to: StockStatus, ctx?: TransactionContext): Promise<number>;
  deleteByUser(userId: string, month: string, ctx?: TransactionContext): Promise<number>;
}
