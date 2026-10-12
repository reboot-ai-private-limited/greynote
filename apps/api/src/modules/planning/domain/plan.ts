/** What a planned day is for (ERD Module 5). */
export const WORKING_TYPES = ['FIELD_WORK', 'DOCTOR_CAMPAIGN', 'MEETING', 'CONFERENCE', 'STRIKE'] as const;
export type WorkingType = (typeof WORKING_TYPES)[number];
/** Field work and a doctor campaign are the days that go to doctors and chemists: they have Routes and doctors. */
export const isFieldDay = (t: WorkingType): boolean => t === 'FIELD_WORK' || t === 'DOCTOR_CAMPAIGN';

/**
 * Where a Daily Plan's body came from. `MONTHLY`: written from an approved Monthly Plan's entry, so the owner can't edit it —
 * they submit it as it is, and only a manager or Admin can amend it. `MANUAL`: the owner wrote it (a day the Monthly Plan
 * didn't cover, or from before inheritance).
 */
export const PLAN_SOURCES = ['MANUAL', 'MONTHLY'] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

/** The approval kinds Planning registers; `recordId` is the Plan's id. */
export const PLAN_KINDS = ['DAILY_PLAN', 'MONTHLY_PLAN'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** One planned day — a `DailyPlan`'s body, and each `MonthlyPlanEntry`. */
export interface PlanDay {
  workingType: WorkingType;
  /** Accompanying colleagues' user ids. */
  workWith: string[];
  routeIds: string[];
  remarks: string | null;
}

/**
 * One doctor on a Daily Plan. `carriedFrom` is the day the doctor was first planned when this entry is a missed call carried
 * over to this day; `null` for a doctor the MR picked for the day.
 */
export interface PlannedDoctor {
  doctorId: string;
  carriedFrom: string | null;
}
