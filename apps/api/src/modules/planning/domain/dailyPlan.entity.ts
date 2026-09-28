import type { PlanDay } from './plan.js';

/**
 * One user's plan for one day. Its approval state is not here — it's the `DAILY_PLAN`
 * `ApprovalRequest` whose `recordId` is this `id`; no request yet means `DRAFT`.
 */
export interface DailyPlan extends PlanDay {
  id: string;
  userId: string;
  /** A calendar day, `YYYY-MM-DD` — not an instant. */
  planDate: string;
  /** Bumped on every save; submit is conditional on the revision it validated. */
  revision: number;
  /** Resubmits made through the after-rejection window; capped by `PLAN_RESUBMIT_GRACE_MAX`. */
  lateResubmits: number;
  updatedAt: Date;
}
