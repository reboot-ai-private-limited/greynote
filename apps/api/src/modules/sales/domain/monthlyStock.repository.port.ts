import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { MonthlyStock, Outlet, StockLine, StockStatus } from './monthlyStock.entity.js';

export interface StockFilter {
  month?: string | undefined;
  productId?: string | undefined;
  /** Restrict to these outlets; `[]` matches nothing. */
  outlets?: Outlet[] | undefined;
}

export interface StockRangeFilter {
  /** `YYYY-MM`, both ends inclusive. */
  fromMonth: string;
  toMonth: string;
  outletType: Outlet['type'];
  outletId?: string | undefined;
  productId?: string | undefined;
}

export interface MonthlyStockRepositoryPort {
  /** Every **approved** count of one kind of outlet over a range of months, oldest month first (a report's read; no per-user visibility). A draft, sent or rejected count reads as not counted. */
  listRange(filter: StockRangeFilter, limit: number): Promise<MonthlyStock[]>;
  /** One row per outlet + product + month: a second write for the same key overwrites the counts and `recordedBy`. */
  upsertMany(outlet: Outlet, month: string, lines: StockLine[], by: string, at: Date, ctx?: TransactionContext, status?: StockStatus): Promise<void>;
  /** Every count one employee recorded for a month, any status (their own screen, and what a submit or an approval acts on). */
  listByRecorder(userId: string, month: string): Promise<MonthlyStock[]>;
  /**
   * Moves one employee's counts for a month from one of the `from` statuses to `to` (a row with no status counts as APPROVED); `distributorId` narrows
   * it to one distributor and `credited` sets who the rows count toward. Returns how many rows changed.
   */
  setStatus(filter: { recordedBy: string; month: string; distributorId?: string }, from: readonly StockStatus[], to: StockStatus, credited?: string[], ctx?: TransactionContext): Promise<number>;
  /** Deletes all distributor counts one employee recorded for a month; how many rows went. */
  deleteByRecorder(userId: string, month: string, ctx?: TransactionContext): Promise<number>;
  list(filter: StockFilter, limit: number): Promise<MonthlyStock[]>;
  /** Outlets among these that have at least one count for the month. */
  outletsWithStock(month: string, outlets: Outlet[]): Promise<Outlet[]>;
  isUnlocked(month: string): Promise<boolean>;
  /** Idempotent; the first unlock's author and time are kept. */
  unlock(month: string, by: string, at: Date): Promise<void>;
}
