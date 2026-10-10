import type { EmployeeSale } from './employeeSale.entity.js';

export interface EmployeeSaleFilter {
  userIds?: string[] | undefined;
  /** `YYYY-MM`, both ends inclusive. */
  fromMonth: string;
  toMonth: string;
  productId?: string | undefined;
}

export interface EmployeeSaleRepositoryPort {
  list(filter: EmployeeSaleFilter, limit: number): Promise<EmployeeSale[]>;
  /** Sets the employee's secondary for these products and month; a changed line keeps its old values in `history`. Leaves the adjustment alone. */
  setSecondary(userId: string, month: string, lines: Array<{ productId: string; qty: number }>, by: string, at: Date): Promise<{ added: number; changed: number }>;
  /** Sets Admin's adjustment (with its reason) for these products and month. Leaves the secondary alone. */
  setAdjustment(userId: string, month: string, lines: Array<{ productId: string; qty: number; reason: string | null }>, by: string, at: Date): Promise<{ added: number; changed: number }>;
}
