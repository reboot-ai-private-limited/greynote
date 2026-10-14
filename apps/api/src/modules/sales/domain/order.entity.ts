import type { Paise } from '@/shared/money/paise.js';
import type { Outlet } from './monthlyStock.entity.js';

export const ORDER_STATUSES = ['PLACED', 'DONE', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPricePaise: Paise;
  /** `quantity × unitPricePaise`, computed by the server — never taken from the phone. */
  amountPaise: Paise;
}

/** A Chemist or Distributor order, placed on its own (not tied to a call). No approval; `PLACED` → `DONE` or `CANCELLED`, once. */
export interface Order {
  id: string;
  userId: string;
  outlet: Outlet;
  /** The day it was placed, `YYYY-MM-DD` in the business timezone. */
  orderDate: string;
  status: OrderStatus;
  /** The sum of the items' amounts. */
  totalAmountPaise: Paise;
  remarks: string | null;
  items: OrderItem[];
  completedBy: string | null;
  completedAt: Date | null;
  /** The phone's id for the record, if it came through sync; `null` for one placed online. */
  clientId: string | null;
  createdAt: Date;
  /** The Admin or Accountant who added it for the employee; `null`/absent when the employee placed it. */
  createdBy?: string | null;
  /** Set when Admin or the Accountant last changed the lines or remarks while it was `PLACED`. */
  editedBy?: string | null;
  editedAt?: Date | null;
}
