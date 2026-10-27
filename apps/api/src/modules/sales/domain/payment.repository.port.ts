import type { DistributorPayment } from './payment.entity.js';

export interface PaymentRepositoryPort {
  create(input: Omit<DistributorPayment, 'id'>): Promise<DistributorPayment>;
  findById(id: string): Promise<DistributorPayment | null>;
  /** The distributor's payments dated in the range (both ends inclusive), newest first, at most `limit`. */
  list(filter: { distributorId: string; from: string; to: string }, limit: number): Promise<DistributorPayment[]>;
  /** What each distributor paid in the range (both ends inclusive): `RECORDED` payments only, one row per distributor that has any. */
  totals(range: { from: string; to: string }): Promise<Array<{ distributorId: string; collectedPaise: number }>>;
  /** Everything each distributor ever paid (`RECORDED` only), whatever the date: the collected side of their dues. */
  collectedAllTime(): Promise<Map<string, number>>;
  /** What `RECORDED` payments have allocated to each of these orders (invoices); an order nothing was paid to is absent. */
  allocatedToOrders(orderIds: string[]): Promise<Map<string, number>>;
  /** `RECORDED` → `CANCELLED` in one conditional update; `false` when it was not `RECORDED` (so of two racing cancels exactly one wins). */
  cancel(id: string, by: string, at: Date, reason: string): Promise<boolean>;
}
