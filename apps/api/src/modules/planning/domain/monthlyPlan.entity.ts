import type { PlanDay } from './plan.js';

/** One planned day of a month — embedded in its `MonthlyPlan`, with no status of its own. */
export interface MonthlyPlanEntry extends PlanDay {
  /** `YYYY-MM-DD`, inside the Plan's month. */
  planDate: string;
}

/**
 * One user's plan for one month, submitted as a whole. Its approval state is the
 * `MONTHLY_PLAN` `ApprovalRequest` whose `recordId` is this `id`.
 */
export interface MonthlyPlan {
  id: string;
  userId: string;
  /** `YYYY-MM`. */
  planMonth: string;
  /** Sorted by date, at most one per day. */
  entries: MonthlyPlanEntry[];
  /** Bumped on every save; submit is conditional on the revision it validated. */
  revision: number;
  /** Resubmits made through the after-rejection window; capped by `PLAN_RESUBMIT_GRACE_MAX`. */
  lateResubmits: number;
  updatedAt: Date;
}
