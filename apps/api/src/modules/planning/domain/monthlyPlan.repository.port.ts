import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { MonthlyPlan, MonthlyPlanEntry } from './monthlyPlan.entity.js';

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
  confirmRevision(id: string, revision: number, countLateResubmit: boolean, ctx: TransactionContext): Promise<boolean>;
}
