/** Field Activity's narrow view of Planning; `planning.contract` satisfies it structurally. */
export interface PlanningPort {
  /** The DCR gate (HLD 10): the day's Plan is past the manager. Which statuses count is Planning's rule, never compared here. */
  isDailyPlanApproved(userId: string, planDate: string): Promise<boolean>;
}
