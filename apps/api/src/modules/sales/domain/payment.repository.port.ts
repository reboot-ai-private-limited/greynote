import type { DistributorPayment } from './payment.entity.js';

export interface PaymentRepositoryPort {
  create(input: Omit<DistributorPayment, 'id'>): Promise<DistributorPayment>;
  findById(id: string): Promise<DistributorPayment | null>;
  /** The distributor's payments dated in the range (both ends inclusive), newest first, at most `limit`. */
  list(filter: { distributorId: string; from: string; to: string }, limit: number): Promise<DistributorPayment[]>;
  /** `RECORDED` → `CANCELLED` in one conditional update; `false` when it was not `RECORDED` (so of two racing cancels exactly one wins). */
  cancel(id: string, by: string, at: Date, reason: string): Promise<boolean>;
}
