import type { DayKind, WorkingType } from './domain/plan.js';
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
  /** True when the user's Monthly Plan for `YYYY-MM` is past the manager (`MANAGER_APPROVED` or `APPROVED`). No Plan is never approved. */
  isMonthlyPlanApproved(userId: string, planMonth: string): Promise<boolean>;
  /** `null` when there's no Plan for that day at all. */
  getDailyPlanStatus(userId: string, planDate: string): Promise<PlanApprovalStatus | null>;
  /**
   * What the day's Plan says — working type and routes — with its status, for TA/DA; `null` with no Plan.
   * Read at the DCR's approval, so a manager's amendment is already in it.
   */
  getDailyPlanDay(userId: string, planDate: string): Promise<{ status: PlanApprovalStatus; workingType: WorkingType; dayKind: DayKind; routeIds: string[]; doctorIds: string[]; changedFromMonthly: boolean } | null>;
  /** The user's daily plans in a date range (both ends inclusive), oldest first, each with its status, working type and Route ids. */
  listDailyPlanDays(userId: string, from: string, to: string): Promise<Array<{ date: string; status: PlanApprovalStatus; workingType: WorkingType; routeIds: string[] }>>;
  /**
   * The doctors on this user's approved daily plans in a month up to yesterday: per doctor the days planned, and the day first
   * planned if they were never called since (`missedSince`) — the visit report's carry-forward column.
   */
  listPlannedDoctors(userId: string, planMonth: string): Promise<Array<{ doctorId: string; plannedDays: number; missedSince: string | null }>>;
  /** `null` when there's no Plan for that month at all. */
  getMonthlyPlanStatus(userId: string, planMonth: string): Promise<PlanApprovalStatus | null>;
}
