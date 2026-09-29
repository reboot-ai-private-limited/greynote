import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SampleAllocation } from './sampleAllocation.entity.js';

export interface SampleAllocationRepositoryPort {
  find(doctorId: string, productId: string): Promise<SampleAllocation | null>;
  findById(id: string): Promise<SampleAllocation | null>;
  listForDoctor(doctorId: string): Promise<SampleAllocation[]>;
  /** Adds `quantity` to the (Doctor, Product) row, creating it if there is none — one atomic step. */
  issue(input: { doctorId: string; productId: string; quantity: number; by: string }): Promise<SampleAllocation>;
  /**
   * Sets the allocated total, keeping what was already given: `null` if there is no such row or the
   * new total is below what has already been given out.
   */
  setAllocated(input: { doctorId: string; productId: string; total: number; by: string }): Promise<SampleAllocation | null>;
  /** Takes `quantity` off the remaining count in one conditional update — `false` if less than that is left. */
  decrementRemaining(allocationId: string, quantity: number, ctx?: TransactionContext): Promise<boolean>;
}
