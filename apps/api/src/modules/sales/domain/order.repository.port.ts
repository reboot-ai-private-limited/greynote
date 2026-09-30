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

export interface OrderRepositoryPort {
  /** Whole paise ordered by these users in the range, `CANCELLED` orders left out. */
  sumAmount(filter: OrderAmountFilter): Promise<number>;
  create(input: Omit<Order, 'id'>, ctx?: TransactionContext): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  list(filter: OrderFilter, limit: number): Promise<Order[]>;
  /** `PLACED` → `DONE` / `CANCELLED` in one conditional update; `false` (nothing changed) if it was not `PLACED`. */
  transition(id: string, to: 'DONE' | 'CANCELLED', by: string, at: Date): Promise<boolean>;
}
