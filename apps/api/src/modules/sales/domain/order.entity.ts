import type { Paise } from '@/shared/money/paise.js';
import type { Outlet } from './monthlyStock.entity.js';
import { suppliedNet, type Discount } from './orderDiscount.js';

export const ORDER_STATUSES = ['PLACED', 'DONE', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPricePaise: Paise;
  /** `quantity × unitPricePaise`, computed by the server — never taken from the phone. */
  amountPaise: Paise;
  /**
   * What the distributor actually supplied of `quantity`, set when the order is marked Done (`0 ≤ suppliedQty ≤ quantity`). `null`/absent on a
   * Placed order and on orders marked Done before supply was recorded: those read as fully supplied.
   */
  suppliedQty?: number | null;
  /** Units given on top, free of charge: stock and secondary count them, the rupees never do. `0`/absent = none. */
  freeQty?: number;
  /** The office's discount on this line (distributor orders only); `null`/absent = none. */
  discount?: Discount | null;
  /** What the line comes to after its own discount and its share of the order discount; `amountPaise` stays the gross. Absent on older orders: read as the gross. */
  netAmountPaise?: Paise;
  /** Set when the order is marked Done: the net for the units actually supplied. */
  suppliedNetPaise?: Paise | null;
}

/** A line's net amount, the gross on orders from before discounts. */
export const netOf = (item: OrderItem): Paise => item.netAmountPaise ?? item.amountPaise;

/** What one line came to when it was delivered: units that arrived and what they cost. Orders without a recorded supply are read as fully supplied. */
export function deliveredOf(item: OrderItem): { suppliedQty: number; freeQty: number; unitsQty: number; amountPaise: Paise } {
  const suppliedQty = item.suppliedQty ?? item.quantity;
  const freeQty = item.freeQty ?? 0;
  return { suppliedQty, freeQty, unitsQty: suppliedQty + freeQty, amountPaise: item.suppliedNetPaise ?? suppliedNet(netOf(item), item.quantity, suppliedQty) };
}

/** The GST invoice frozen when the office marks a distributor order Done: later price or GST changes never move a past invoice. Prices on orders are ex-GST. */
export interface OrderInvoice {
  /** What was supplied, before GST (the sum of the lines' supplied nets). */
  taxablePaise: Paise;
  /** Per line, in the order's line order. */
  lines: Array<{ gstPercent: number; gstPaise: Paise }>;
  gstPaise: Paise;
  /** To the nearest rupee, can be negative. */
  roundOffPaise: number;
  /** `taxablePaise + gstPaise + roundOffPaise`: what the distributor owes for this invoice. */
  totalPaise: Paise;
}

/** A Chemist or Distributor order, placed on its own (not tied to a call). No approval; `PLACED` → `DONE` or `CANCELLED`, once. */
export interface Order {
  id: string;
  userId: string;
  outlet: Outlet;
  /** The day it was placed, `YYYY-MM-DD` in the business timezone. */
  orderDate: string;
  status: OrderStatus;
  /** What the order comes to after all discounts (the sum of the lines' nets); equals the gross when nothing is discounted. */
  totalAmountPaise: Paise;
  /** The office's discount on the whole order (distributor orders only); `null`/absent = none. */
  discount?: Discount | null;
  /** The order-level discount in rupees, already shared into the lines' nets. */
  orderDiscountPaise?: Paise;
  /** What was delivered, at the order's prices, free units excluded: set when marked Done. `null`/absent before, and on older Done orders (read as the total). */
  suppliedAmountPaise?: Paise | null;
  /** What the employee ordered, kept the first time the office changes the order (lines and total); `null`/absent if never changed. */
  originalItems?: OrderItem[] | null;
  originalTotalAmountPaise?: Paise | null;
  remarks: string | null;
  items: OrderItem[];
  completedBy: string | null;
  completedAt: Date | null;
  /** The office's invoice number, set when marked Done (unique); `null`/absent on a Placed order and on orders marked Done before invoices. */
  invoiceNumber?: string | null;
  invoice?: OrderInvoice | null;
  /** The phone's id for the record, if it came through sync; `null` for one placed online. */
  clientId: string | null;
  createdAt: Date;
  /** The Admin or Accountant who added it for the employee; `null`/absent when the employee placed it. */
  createdBy?: string | null;
  /** Set when Admin or the Accountant last changed the lines or remarks while it was `PLACED`. */
  editedBy?: string | null;
  editedAt?: Date | null;
}
