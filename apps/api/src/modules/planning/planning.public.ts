import type { PlanApprovalStatus } from './domain/approvals.port.js';

export type { PlanApprovalStatus } from './domain/approvals.port.js';

/**
 * The only thing another module may import from `planning/`. Dates are calendar days
 * (`YYYY-MM-DD`), months `YYYY-MM`. Status only — a consumer that needs a Plan's routes is a
 * reason to extend this, not to reach past it.
 */
export interface PlanningPublicContract {
  /**
   * The DCR gate (HLD 10, sign-off B4): may this user log field activity on this date? True once
   * the day's Plan is past the manager — `MANAGER_APPROVED` or `APPROVED`. No Plan is never
   * approved by default.
   */
  isDailyPlanApproved(userId: string, planDate: string): Promise<boolean>;
  /** `null` when there's no Plan for that day at all. */
  getDailyPlanStatus(userId: string, planDate: string): Promise<PlanApprovalStatus | null>;
  /** `null` when there's no Plan for that month at all. */
  getMonthlyPlanStatus(userId: string, planMonth: string): Promise<PlanApprovalStatus | null>;
}
