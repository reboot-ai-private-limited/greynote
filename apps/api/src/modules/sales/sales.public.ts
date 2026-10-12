import type { Order, OrderStatus } from './domain/order.entity.js';
import type { MonthlyStock, Outlet } from './domain/monthlyStock.entity.js';
import type { DistributorOrderSum, UserOrderSum } from './domain/order.repository.port.js';
import type { EmployeeSale, MonthSecondaryStatus } from './domain/employeeSale.entity.js';
import type { StockStatement } from './domain/stockStatement.entity.js';
import type { MissingStockRow } from './application/usecases/readMonthlyStock.usecase.js';

export type { Order, OrderStatus } from './domain/order.entity.js';
export type { MonthlyStock } from './domain/monthlyStock.entity.js';
export type { DistributorOrderSum } from './domain/order.repository.port.js';
export type { EmployeeSale, MonthSecondaryStatus } from './domain/employeeSale.entity.js';
export type { UserOrderSum } from './domain/order.repository.port.js';
export type { StockStatement } from './domain/stockStatement.entity.js';
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
  /** The Admin statements over a range of months (`YYYY-MM`, both inclusive), oldest first, at most `limit` (default 20000) — the Sales report's input. */
  listStatements(filter: { fromMonth: string; toMonth: string; distributorId?: string; productId?: string; limit?: number }): Promise<StockStatement[]>;
  listStockRange(filter: { fromMonth: string; toMonth: string; outletType: Outlet['type']; outletId?: string; productId?: string; limit?: number }): Promise<MonthlyStock[]>;
  /** Employees' Done orders **to distributors** by month, employee and product — an employee's primary. `from`–`to` are dates, both inclusive. */
  sumUserOrders(filter: { from: string; to: string; userIds?: string[]; productId?: string }): Promise<UserOrderSum[]>;
  /** The secondary and primary adjustment employees entered, over a range of months (`YYYY-MM`, both inclusive), at most `limit` (default 20000). */
  listEmployeeSales(filter: { fromMonth: string; toMonth: string; userIds?: string[]; productId?: string; limit?: number }): Promise<EmployeeSale[]>;
  /** One order by id, anyone's; `null` when there is none. */
  getOrder(orderId: string): Promise<Order | null>;
  /** Outlets with no stock count for the month, by MR — for everyone (Admin's view), or only the active field employees among `userIds`. */
  listMissingStock(month: string, userIds?: string[]): Promise<MissingStockRow[]>;
  /** Where each of these employees' secondary for the month stands (`NOT_ENTERED` when they entered none); every id asked for is answered, in the order given. */
  listSecondaryStatus(month: string, userIds: string[]): Promise<Array<{ userId: string; status: MonthSecondaryStatus }>>;
}
