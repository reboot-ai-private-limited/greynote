import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DailyPlan } from './dailyPlan.entity.js';
import type { PlanDay } from './plan.js';

export interface DailyPlanRepositoryPort {
  findById(id: string): Promise<DailyPlan | null>;
  findByUserAndDate(userId: string, planDate: string): Promise<DailyPlan | null>;
  /** Both ends inclusive, oldest first. */
  listForUser(userId: string, from: string, to: string): Promise<DailyPlan[]>;
  /**
   * Creates the day's plan (`expectedRevision` null) or replaces its body if it's still at
   * `expectedRevision`, bumping `revision`. `null` when it moved on (or was created meanwhile).
   */
  save(userId: string, planDate: string, day: PlanDay, expectedRevision: number | null): Promise<DailyPlan | null>;
  /**
   * Inside the submit transaction: bumps `revision` only if the plan is still at `revision`.
   * Both sides being conditional is what stops an edit and a submit crossing — the submit can't
   * send a plan it didn't validate, and the edit can't land on a plan that was just submitted.
   */
  confirmRevision(id: string, revision: number, ctx: TransactionContext): Promise<boolean>;
}
