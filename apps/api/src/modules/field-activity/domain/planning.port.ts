import type { DayKind, WorkingType } from '@greynote/contracts';

/** Field Activity's narrow view of Planning; `planning.contract` satisfies it structurally. */
export interface PlanningPort {
  /** The DCR gate (HLD 10): the day's Plan is past the manager. Which statuses count is Planning's rule, never compared here. */
  isDailyPlanApproved(userId: string, planDate: string): Promise<boolean>;
  /** The Monthly Plan for `YYYY-MM` is past the manager. No approved month, no work (decision-log 2026-10-12). */
  isMonthlyPlanApproved(userId: string, planMonth: string): Promise<boolean>;
  /** The day's working type, kind (a stay or transit day of an out-station trip; `NORMAL` when absent) and routes, for TA/DA; `null` with no Plan. */
  getDailyPlanDay(userId: string, planDate: string): Promise<{ workingType: WorkingType; dayKind?: DayKind; routeIds: string[]; doctorIds?: string[] } | null>;
}
