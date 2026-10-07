import type { Order, OrderStatus } from './domain/order.entity.js';
import type { Outlet } from './domain/monthlyStock.entity.js';
import type { MissingStockRow } from './application/usecases/readMonthlyStock.usecase.js';

export type { Order, OrderStatus } from './domain/order.entity.js';
export type { MissingStockRow } from './application/usecases/readMonthlyStock.usecase.js';

/** The only thing another module may import from `sales/`. Months are `YYYY-MM`. Grows on demand (Orders, reports). */
export interface SalesPublicContract {
  /**
   * Whole paise these users ordered on dates in `from`–`to` (inclusive), `CANCELLED` orders left out — `PLACED` and
   * `DONE` both count. With `productId`, only that Product's lines. Marketing's "achieved" (HLD 8); never stored.
   */
  sumOrderAmount(filter: { userIds: string[]; from: string; to: string; productId?: string | undefined }): Promise<number>;
  /**
   * Orders for a report, anyone's (Admin's view), newest first: the order dates in `from`–`to` (both inclusive), optionally one status, one outlet, one MR.
   * At most `limit` rows (default 2000); a caller that gets exactly `limit` knows there may be more.
   */
  listOrders(filter: { from?: string; to?: string; status?: OrderStatus; outlet?: Outlet; userId?: string; limit?: number }): Promise<Order[]>;
  /** One order by id, anyone's; `null` when there is none. */
  getOrder(orderId: string): Promise<Order | null>;
  /** Outlets with no stock count for the month, by MR — for everyone (Admin's view). */
  listMissingStock(month: string): Promise<MissingStockRow[]>;
}
