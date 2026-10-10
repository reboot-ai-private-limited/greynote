import type { Paise } from '@/shared/money/paise.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Outlet } from './monthlyStock.entity.js';
import type { Order, OrderStatus } from './order.entity.js';

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
  distributorId?: string | undefined;
  productId?: string | undefined;
}

/** What one employee's Done orders **to distributors** add up to for one product in one month (the month they were marked Done). */
export interface UserOrderSum {
  month: string;
  userId: string;
  productId: string;
  quantity: number;
  amountPaise: Paise;
}

export interface UserOrderSumFilter {
  /** `YYYY-MM-DD`, both ends inclusive. */
  from: string;
  to: string;
  timeZone: string;
  userIds?: string[] | undefined;
  productId?: string | undefined;
}

export interface OrderRepositoryPort {
  /** Done orders **to distributors** by month, employee and product — an employee's primary. Placed and cancelled orders never appear; chemist orders neither. */
  sumUserOrders(filter: UserOrderSumFilter): Promise<UserOrderSum[]>;
  /** Orders **to distributors** by month, distributor, product and status (cancelled ones never appear, chemist orders neither). */
  sumDistributorOrders(filter: DistributorOrderSumFilter): Promise<DistributorOrderSum[]>;
  /** Whole paise ordered by these users in the range, `CANCELLED` orders left out. */
  sumAmount(filter: OrderAmountFilter): Promise<number>;
  create(input: Omit<Order, 'id'>, ctx?: TransactionContext): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  list(filter: OrderFilter, limit: number): Promise<Order[]>;
  /** `PLACED` → `DONE` / `CANCELLED` in one conditional update; `false` (nothing changed) if it was not `PLACED`. */
  transition(id: string, to: 'DONE' | 'CANCELLED', by: string, at: Date): Promise<boolean>;
}
