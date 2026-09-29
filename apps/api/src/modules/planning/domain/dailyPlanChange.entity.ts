import type { PlanDay } from './plan.js';

/**
 * A request to change an approved Daily Plan on its own day (client §2.6; LLD planning.md, In-day
 * changes). It's its own approvable record — the `DAILY_PLAN_CHANGE` request, approved by the
 * employee's manager — so the plan itself stays approved, and the day's gate stays open, while it
 * waits. Its status is that request's; `open` and `applied` are Planning's own bookkeeping.
 */
export interface DailyPlanChange {
  id: string;
  planId: string;
  userId: string;
  /** The plan's day, `YYYY-MM-DD`. */
  planDate: string;
  /** The plan as it was when the change was requested — what the approver compares against. */
  previous: PlanDay;
  proposed: PlanDay;
  reason: string;
  /** The plan revision it was made against; approving it fails if the plan has moved on. */
  basedOnRevision: number;
  /** Waiting for a decision. At most one per plan. */
  open: boolean;
  /** Approved and written into the plan. Counts toward `DAILY_PLAN_CHANGE_MAX`. */
  applied: boolean;
  createdAt: Date;
}
