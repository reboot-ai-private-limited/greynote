import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { EmployeeSale, SecondaryStatus } from './employeeSale.entity.js';

export interface EmployeeSaleFilter {
  userIds?: string[] | undefined;
  /** `YYYY-MM`, both ends inclusive. */
  fromMonth: string;
  toMonth: string;
  productId?: string | undefined;
}

export interface EmployeeSaleRepositoryPort {
  list(filter: EmployeeSaleFilter, limit: number): Promise<EmployeeSale[]>;
  /** Sets the employee's secondary (units, amount at PTR, and the status they start in) for these products and month; a changed line keeps its old values in `history`. Leaves the adjustment alone. */
  setSecondary(userId: string, month: string, lines: Array<{ productId: string; qty: number; amountPaise: number | null }>, status: SecondaryStatus, by: string, at: Date): Promise<{ added: number; changed: number }>;
  /** Moves the month's entered secondary from any of the `from` statuses to `to` (legacy rows with no status count as APPROVED). Returns how many rows moved. */
  setSecondaryStatus(userId: string, month: string, from: SecondaryStatus[], to: SecondaryStatus, ctx?: TransactionContext): Promise<number>;
  /** Sets Admin's adjustment (with its reason) for these products and month. Leaves the secondary alone. */
  setAdjustment(userId: string, month: string, lines: Array<{ productId: string; qty: number; reason: string | null }>, by: string, at: Date): Promise<{ added: number; changed: number }>;
}
