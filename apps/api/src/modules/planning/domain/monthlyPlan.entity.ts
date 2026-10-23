import type { PlanDay } from './plan.js';

/** One planned day of a month — embedded in its `MonthlyPlan`, with no status of its own. */
export interface MonthlyPlanEntry extends PlanDay {
  /** `YYYY-MM-DD`, inside the Plan's month. */
  planDate: string;
  /**
   * On the first day of an out-station trip: the day the employee comes back (`YYYY-MM-DD`, after `planDate`, same month).
   * The days in between are `STAY` entries and this day a `TRANSIT` entry — the server writes them. Null for an ordinary day
   * and for a same-day return.
   */
  returnDate: string | null;
}

/** A manager's or Admin's change to a waiting month, kept with the days it replaced. */
export interface MonthlyPlanAmendment {
  by: string;
  at: Date;
  reason: string;
  previous: MonthlyPlanEntry[];
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
  /** Oldest first. */
  amendments: MonthlyPlanAmendment[];
  /** Bumped on every save; submit is conditional on the revision it validated. */
  revision: number;
  /** Resubmits made through the after-rejection window; capped by `PLAN_RESUBMIT_GRACE_MAX`. */
  lateResubmits: number;
  updatedAt: Date;
}
