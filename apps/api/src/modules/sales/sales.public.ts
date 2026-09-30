import type { MissingStockRow } from './application/usecases/readMonthlyStock.usecase.js';

export type { MissingStockRow } from './application/usecases/readMonthlyStock.usecase.js';

/** The only thing another module may import from `sales/`. Months are `YYYY-MM`. Grows on demand (Orders, reports). */
export interface SalesPublicContract {
  /**
   * Whole paise these users ordered on dates in `from`–`to` (inclusive), `CANCELLED` orders left out — `PLACED` and
   * `DONE` both count. With `productId`, only that Product's lines. Marketing's "achieved" (HLD 8); never stored.
   */
  sumOrderAmount(filter: { userIds: string[]; from: string; to: string; productId?: string | undefined }): Promise<number>;
  /** Outlets with no stock count for the month, by MR — for everyone (Admin's view). */
  listMissingStock(month: string): Promise<MissingStockRow[]>;
}
