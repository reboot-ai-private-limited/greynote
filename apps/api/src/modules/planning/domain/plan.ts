/** What a planned day is for (ERD Module 5). */
export const WORKING_TYPES = ['FIELD_WORK', 'MEETING', 'CONFERENCE', 'STRIKE'] as const;
export type WorkingType = (typeof WORKING_TYPES)[number];

/** The approval kinds Planning registers; `recordId` is the Plan's id. */
export const PLAN_KINDS = ['DAILY_PLAN', 'MONTHLY_PLAN'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** The approval kind for an in-day change to an approved Daily Plan; `recordId` is the change's id. */
export const DAILY_PLAN_CHANGE_KIND = 'DAILY_PLAN_CHANGE';

/** One planned day — a `DailyPlan`'s body, and each `MonthlyPlanEntry`. */
export interface PlanDay {
  workingType: WorkingType;
  /** Accompanying colleagues' user ids. */
  workWith: string[];
  routeIds: string[];
  remarks: string | null;
}
