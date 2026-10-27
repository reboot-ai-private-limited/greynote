import type { Paise } from '@/shared/money/paise.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Outlet } from './monthlyStock.entity.js';
import type { Order, OrderInvoice, OrderStatus } from './order.entity.js';

export interface OrderFilter {
  /** Restrict to orders placed by these users; `undefined` = anyone. */
  userIds?: string[] | undefined;
  status?: OrderStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
  outlet?: Outlet | undefined;
}

export interface OrderAmountFilter {
  userIds: string[];
  /** Order dates, both ends inclusive (`YYYY-MM-DD`). */
  from: string;
  to: string;
  /** Only this Product's lines; omitted = whole orders. */
  productId?: string | undefined;
}

/** One line of the primary-sales picture: what one distributor's orders for one product add up to in one month, by status. */
export interface DistributorOrderSum {
  /** `YYYY-MM`: for a `DONE` order the month it was marked Done, for a `PLACED` one the month it was placed (business timezone). */
  month: string;
  distributorId: string;
  productId: string;
  status: 'DONE' | 'PLACED';
  quantity: number;
  amountPaise: Paise;
}

export interface DistributorOrderSumFilter {
  /** `YYYY-MM-DD`, both ends inclusive: a Done order counts when it was marked Done in the range, a Placed one when placed in it. */
  from: string;
  to: string;
  timeZone: string;
  /** `HH:mm` the business day starts; midnight when absent. */
  dayStart?: string | undefined;
  distributorId?: string | undefined;
  productId?: string | undefined;
}

/** What one employee's Done orders **to one distributor** add up to for one product in one month (the month they were marked Done). */
export interface UserOrderSum {
  month: string;
  userId: string;
  distributorId: string;
  productId: string;
  quantity: number;
  amountPaise: Paise;
}

export interface UserOrderSumFilter {
  /** `YYYY-MM-DD`, both ends inclusive. */
  from: string;
  to: string;
  timeZone: string;
  /** `HH:mm` the business day starts; midnight when absent. */
  dayStart?: string | undefined;
  userIds?: string[] | undefined;
  productId?: string | undefined;
}

export interface OrderRepositoryPort {
  /** Done orders **to distributors** by month, employee and product — an employee's primary. Quantity is the units delivered (supplied + free), the amount is supplied × price. Placed and cancelled orders never appear; chemist orders neither. */
  sumUserOrders(filter: UserOrderSumFilter): Promise<UserOrderSum[]>;
  /** Orders **to distributors** by month, distributor, product and status (cancelled ones never appear, chemist orders neither). */
  sumDistributorOrders(filter: DistributorOrderSumFilter): Promise<DistributorOrderSum[]>;
  /** Whole paise ordered by these users in the range, `CANCELLED` orders left out. */
  sumAmount(filter: OrderAmountFilter): Promise<number>;
  create(input: Omit<Order, 'id'>, ctx?: TransactionContext): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  list(filter: OrderFilter, limit: number): Promise<Order[]>;
  /** Replace a `PLACED` order's lines, total and remarks in one conditional update, keeping `original` (what the employee ordered) the first time; `false` if it is no longer `PLACED` or was changed since it was read (`ifEditedAt`). */
  update(id: string, change: { items: Order['items']; totalAmountPaise: Paise; discount: Order['discount']; orderDiscountPaise: Paise; remarks: string | null; original?: { items: Order['items']; totalAmountPaise: Paise } }, by: string, at: Date, ifEditedAt: Date | null): Promise<boolean>;
  /** Everything delivered by these distributors (all of them when omitted) in Done orders, in whole paise (supplied × price, free units left out), all time. */
  sumDoneByDistributor(distributorIds?: string[]): Promise<Map<string, number>>;
  /** `PLACED` → `DONE` with what was delivered, in one conditional update; `false` if the order is no longer `PLACED` or was changed since it was read (`ifEditedAt`). */
  complete(id: string, supply: { items: Order['items']; suppliedAmountPaise: Paise; invoiceNumber: string; invoice: OrderInvoice; ifEditedAt: Date | null }, by: string, at: Date): Promise<boolean>;
  /** Gives a Done order that has no invoice number one (and its frozen invoice); `false` when it is not Done or already has one. Throws `invoiceNumberTaken` for a used number. */
  setInvoice(id: string, invoiceNumber: string, invoice: OrderInvoice): Promise<boolean>;
  /** `PLACED` → `DONE` / `CANCELLED` in one conditional update; `false` (nothing changed) if it was not `PLACED`. */
  transition(id: string, to: 'DONE' | 'CANCELLED', by: string, at: Date): Promise<boolean>;
}
