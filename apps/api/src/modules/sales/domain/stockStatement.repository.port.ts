import type { StatementLine, StockStatement } from './stockStatement.entity.js';

export interface StatementRangeFilter {
  /** `YYYY-MM`, both ends inclusive. */
  fromMonth: string;
  toMonth: string;
  distributorId?: string | undefined;
  productId?: string | undefined;
}

export interface StockStatementRepositoryPort {
  list(filter: StatementRangeFilter, limit: number): Promise<StockStatement[]>;
  /** Writes the lines for one distributor and month. A line that is not already there is added; one that differs is replaced with its old values kept in `history`; an identical one is left alone. */
  upsertMany(distributorId: string, month: string, lines: StatementLine[], by: string, at: Date): Promise<{ added: number; changed: number }>;
}
