import type { WorkingType } from '@greynote/contracts';

/** Field Activity's narrow view of Planning; `planning.contract` satisfies it structurally. */
export interface PlanningPort {
  /** The DCR gate (HLD 10): the day's Plan is past the manager. Which statuses count is Planning's rule, never compared here. */
  isDailyPlanApproved(userId: string, planDate: string): Promise<boolean>;
  /** The day's working type and routes, for TA/DA; `null` with no Plan. */
  getDailyPlanDay(userId: string, planDate: string): Promise<{ workingType: WorkingType; routeIds: string[]; doctorIds?: string[] } | null>;
}
