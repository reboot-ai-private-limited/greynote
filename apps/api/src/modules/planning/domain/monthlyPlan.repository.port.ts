import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { MonthlyPlan, MonthlyPlanAmendment, MonthlyPlanEntry, MonthlyPlanPendingChange } from './monthlyPlan.entity.js';

/** Same revision contract as `DailyPlanRepositoryPort`. */
export interface MonthlyPlanRepositoryPort {
  findById(id: string): Promise<MonthlyPlan | null>;
  findByUserAndMonth(userId: string, planMonth: string): Promise<MonthlyPlan | null>;
  /** Both ends inclusive, oldest first. */
  listForUser(userId: string, fromMonth: string, toMonth: string): Promise<MonthlyPlan[]>;
  /** Every user's Monthly Plan for this month and later. For the one-off backfill. */
  listFromMonth(planMonth: string): Promise<MonthlyPlan[]>;
  save(
    userId: string,
    planMonth: string,
    entries: MonthlyPlanEntry[],
    expectedRevision: number | null,
  ): Promise<MonthlyPlan | null>;
  /**
   * A manager's or Admin's amendment: replaces the entries and appends `amendment`, bumping `revision`, only if the plan is still
   * at `expectedRevision` (`null` otherwise).
   */
  amend(id: string, expectedRevision: number, entries: MonthlyPlanEntry[], amendment: MonthlyPlanAmendment, ctx?: TransactionContext): Promise<MonthlyPlan | null>;
  /**
   * Keeps a manager's proposed change on the plan, only while the plan has none (`false` otherwise: someone else's is waiting). Does not
   * change the revision: the employee's plan itself is untouched until the change is approved.
   */
  setPendingChange(id: string, change: MonthlyPlanPendingChange, ctx?: TransactionContext): Promise<boolean>;
  /** Removes the waiting change (approved and applied, rejected or withdrawn). */
  clearPendingChange(id: string, ctx?: TransactionContext): Promise<void>;
  /** Inside a transaction: remembers `entries` as the last approved version of the month (no revision change). */
  recordApproved(id: string, entries: MonthlyPlanEntry[], ctx: TransactionContext): Promise<void>;
  /** Inside a transaction: removes the plan, only if it is still at `revision`. */
  deleteById(id: string, revision: number, ctx: TransactionContext): Promise<boolean>;
  confirmRevision(id: string, revision: number, countLateResubmit: boolean, ctx: TransactionContext): Promise<boolean>;
}
