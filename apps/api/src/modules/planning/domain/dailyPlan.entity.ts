import type { PlanDay, PlannedDoctor, PlanSource } from './plan.js';

/** A manager's or Admin's change to a day, kept with what it replaced. */
export interface PlanAmendment {
  by: string;
  at: Date;
  reason: string;
  previous: PlanDay;
}

/**
 * One user's plan for one day. Its approval state is not here — it's the `DAILY_PLAN`
 * `ApprovalRequest` whose `recordId` is this `id`; no request yet means `DRAFT`.
 */
export interface DailyPlan extends PlanDay {
  id: string;
  userId: string;
  /** A calendar day, `YYYY-MM-DD` — not an instant. */
  planDate: string;
  source: PlanSource;
  /**
   * What the Monthly Plan said for this day, kept when the employee changed it (working type, routes, work with or remarks); `null`
   * while the day is as the Monthly Plan wrote it, and for a day that never came from one. The approver sees "changed from monthly".
   */
  plannedFrom: PlanDay | null;
  /** The doctors to call this day — the MR's picks plus missed calls carried over. Calls due = its length. */
  doctors: PlannedDoctor[];
  /** Oldest first. */
  amendments: PlanAmendment[];
  /** Bumped on every save; submit is conditional on the revision it validated. */
  revision: number;
  /** Resubmits made through the after-rejection window; capped by `PLAN_RESUBMIT_GRACE_MAX`. */
  lateResubmits: number;
  updatedAt: Date;
}
