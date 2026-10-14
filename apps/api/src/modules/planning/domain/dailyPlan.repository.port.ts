import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DailyPlan, PlanAmendment } from './dailyPlan.entity.js';
import type { PlanDay, PlannedDoctor } from './plan.js';

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
  /** Replaces the day's doctor list only if the plan is still at `expectedRevision`, bumping it. `null` when it moved on. */
  saveDoctors(id: string, expectedRevision: number, doctors: PlannedDoctor[]): Promise<DailyPlan | null>;
  /**
   * Inside the Monthly Plan's approval transaction: creates the day's plan from the Monthly entry (`source: MONTHLY`) unless one
   * exists for that day, in which case nothing changes. Returns whether it created one.
   */
  createInherited(userId: string, planDate: string, day: PlanDay, ctx: TransactionContext): Promise<boolean>;
  /**
   * A manager's own edit of their day (work with, routes, remarks and doctors together) while the plan is editable: replaces the
   * body and the doctors, marks the plan `MANUAL` so a later Monthly Plan approval won't overwrite it, and bumps `revision`, only
   * if the plan is still at `expectedRevision`. `null` when it moved on.
   */
  saveManagerDay(id: string, expectedRevision: number, day: PlanDay, doctors: PlannedDoctor[]): Promise<DailyPlan | null>;
  /**
   * A manager's or Admin's amendment: replaces the body and appends `amendment`, bumping `revision`, only if the plan is still
   * at `expectedRevision`. `null` when it moved on.
   */
  amend(id: string, expectedRevision: number, day: PlanDay, amendment: PlanAmendment): Promise<DailyPlan | null>;
  /**
   * Inside an approval's transaction: replaces the plan's body with a monthly-plan entry, but
   * only if the plan is still at `revision` (the one the entry was read against), bumping it.
   */
  applyChange(id: string, revision: number, day: PlanDay, ctx: TransactionContext): Promise<boolean>;
  /**
   * Inside the submit transaction: bumps `revision` only if the plan is still at `revision`.
   * Both sides being conditional is what stops an edit and a submit crossing — the submit can't
   * send a plan it didn't validate, and the edit can't land on a plan that was just submitted.
   * `countLateResubmit` also raises `lateResubmits`, for a submit through the resubmit window.
   */
  confirmRevision(id: string, revision: number, countLateResubmit: boolean, ctx: TransactionContext): Promise<boolean>;
}
