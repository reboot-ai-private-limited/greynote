import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { MonthlyStock, Outlet, StockLine } from './monthlyStock.entity.js';

export interface StockFilter {
  month?: string | undefined;
  productId?: string | undefined;
  /** Restrict to these outlets; `[]` matches nothing. */
  outlets?: Outlet[] | undefined;
}

export interface MonthlyStockRepositoryPort {
  /** One row per outlet + product + month: a second write for the same key overwrites the counts and `recordedBy`. */
  upsertMany(outlet: Outlet, month: string, lines: StockLine[], by: string, at: Date, ctx?: TransactionContext): Promise<void>;
  list(filter: StockFilter, limit: number): Promise<MonthlyStock[]>;
  /** Outlets among these that have at least one count for the month. */
  outletsWithStock(month: string, outlets: Outlet[]): Promise<Outlet[]>;
  isUnlocked(month: string): Promise<boolean>;
  /** Idempotent; the first unlock's author and time are kept. */
  unlock(month: string, by: string, at: Date): Promise<void>;
}
