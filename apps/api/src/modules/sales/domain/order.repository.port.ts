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

export interface OrderRepositoryPort {
  create(input: Omit<Order, 'id'>, ctx?: TransactionContext): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  list(filter: OrderFilter, limit: number): Promise<Order[]>;
  /** `PLACED` → `DONE` / `CANCELLED` in one conditional update; `false` (nothing changed) if it was not `PLACED`. */
  transition(id: string, to: 'DONE' | 'CANCELLED', by: string, at: Date): Promise<boolean>;
}
