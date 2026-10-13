import type { RoleName } from '@greynote/contracts';
import type { ExpenseType } from './expense.entity.js';

/**
 * One change HR (or Admin) made to a day's expense, kept for good (decision-log 2026-10-13): the amount before and after, the reason, who and
 * when. `EDIT` changes an existing row; `ADD` puts an amount on a day that had none (`beforePaise` is 0). The expense row keeps the first
 * amount it ever had as `originalAmountPaise`, so "was X, now Y" needs no replay of this log.
 */
export interface ExpenseAdjustment {
  id: string;
  userId: string;
  /** `YYYY-MM` of the day. */
  month: string;
  reportDate: string;
  expenseId: string;
  type: ExpenseType;
  kind: 'EDIT' | 'ADD';
  beforePaise: number;
  afterPaise: number;
  reason: string;
  by: string;
  byRole: RoleName;
  at: Date;
}

export interface ExpenseAdjustmentRepositoryPort {
  create(input: Omit<ExpenseAdjustment, 'id'>, ctx: unknown): Promise<ExpenseAdjustment>;
  /** Every adjustment of the employee's month, oldest first. */
  listForUserMonth(userId: string, month: string): Promise<ExpenseAdjustment[]>;
}
