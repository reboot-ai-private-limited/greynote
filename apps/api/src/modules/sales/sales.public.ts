import type { MissingStockRow } from './application/usecases/readMonthlyStock.usecase.js';

export type { MissingStockRow } from './application/usecases/readMonthlyStock.usecase.js';

/** The only thing another module may import from `sales/`. Months are `YYYY-MM`. Grows on demand (Orders, reports). */
export interface SalesPublicContract {
  /** Outlets with no stock count for the month, by MR — for everyone (Admin's view). */
  listMissingStock(month: string): Promise<MissingStockRow[]>;
}
