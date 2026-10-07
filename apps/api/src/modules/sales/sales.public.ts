import type { Order, OrderStatus } from './domain/order.entity.js';
import type { MonthlyStock, Outlet } from './domain/monthlyStock.entity.js';
import type { DistributorOrderSum } from './domain/order.repository.port.js';
import type { MissingStockRow } from './application/usecases/readMonthlyStock.usecase.js';

export type { Order, OrderStatus } from './domain/order.entity.js';
export type { MonthlyStock } from './domain/monthlyStock.entity.js';
export type { DistributorOrderSum } from './domain/order.repository.port.js';
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
  /**
   * Orders **to distributors** added up by month, distributor, product and status — the primary-sales picture. A Done order counts in the month it
   * was marked Done, a Placed one in the month it was placed (business timezone); cancelled orders and chemist orders never appear. `from`–`to`
   * are dates, both inclusive.
   */
  sumDistributorOrders(filter: { from: string; to: string; distributorId?: string; productId?: string }): Promise<DistributorOrderSum[]>;
  /** Every stock count of one kind of outlet over a range of months (`YYYY-MM`, both inclusive), oldest first, at most `limit` (default 20000). */
  listStockRange(filter: { fromMonth: string; toMonth: string; outletType: Outlet['type']; outletId?: string; productId?: string; limit?: number }): Promise<MonthlyStock[]>;
  /** One order by id, anyone's; `null` when there is none. */
  getOrder(orderId: string): Promise<Order | null>;
  /** Outlets with no stock count for the month, by MR — for everyone (Admin's view). */
  listMissingStock(month: string): Promise<MissingStockRow[]>;
}
