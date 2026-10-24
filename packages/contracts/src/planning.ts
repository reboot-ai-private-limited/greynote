/**
 * Plans over HTTP, as the approval previews read them. Dates are ISO strings on the wire; `planDate` is a
 * calendar day (`YYYY-MM-DD`), `planMonth` a month (`YYYY-MM`).
 */
import type { DayKind, WorkingType } from './sync.js';

/** One planned day, whether a daily plan's body or one entry of a monthly plan. */
export interface PlanDayDto {
  workingType: WorkingType;
  /** `STAY` / `TRANSIT`: a day of an out-station trip the server wrote from the first day's `returnDate`. */
  dayKind: DayKind;
  /** Accompanying colleagues' user ids. */
  workWith: string[];
  routeIds: string[];
  remarks: string | null;
}

/** Where a plan stands: the approval it sits in, and the dates that gate submitting it. */
export interface PlanStateDto {
  /** `DRAFT` until submitted, then its approval status. */
  status: string;
  approval: { requestId: string; cycle: number; submittedAt: string; decidedAt: string | null } | null;
  /** When a submit stops being accepted without a late-submission exception. */
  submitDeadline: string;
  resubmitAllowedUntil: string | null;
  lateSubmitAllowedUntil: string | null;
}

/** A manager's or Admin's change to a day, with what it replaced. */
export interface PlanAmendmentDto {
  /** User id of the manager or Admin. */
  by: string;
  at: string;
  reason: string;
  previous: PlanDayDto;
}

export interface PlannedDoctorDto {
  doctorId: string;
  /** The day the doctor was first planned, when this is a missed call carried over; `null` for a doctor the MR picked. */
  carriedFrom: string | null;
}

export interface DailyPlanDto extends PlanDayDto, PlanStateDto {
  id: string;
  /** The doctors to call this day; their count is the calls due. */
  doctors: PlannedDoctorDto[];
  userId: string;
  planDate: string;
  /** `MONTHLY`: the day is as the approved monthly plan wrote it. `MANUAL`: the owner changed it (or it never came from one). */
  source: 'MANUAL' | 'MONTHLY';
  /** What the monthly plan said for this day, once the owner changed it; `null` while the day is the monthly plan's. */
  plannedFrom: PlanDayDto | null;
  /** `plannedFrom` is set: show "changed from monthly". */
  changedFromMonthly: boolean;
  /** Oldest first. */
  amendments: PlanAmendmentDto[];
  /** Bumped on every save. */
  revision: number;
  updatedAt: string;
}

export interface MonthlyPlanEntryDto extends PlanDayDto {
  planDate: string;
  /** On a trip's first day: the day the employee comes back. The days between are `STAY`, the return day `TRANSIT`. Null otherwise. */
  returnDate: string | null;
}

/** Why a day can't be planned: the employee's weekly off day, or a holiday that applies to their main HQ. */
export const PLAN_OFF_DAY_REASONS = ['WEEKLY_OFF', 'HOLIDAY'] as const;
export type PlanOffDayReason = (typeof PLAN_OFF_DAY_REASONS)[number];

/** A day of the month that is locked on the Monthly Plan: shown as "Weekly off" or "Holiday · <name>", with nothing to fill in. */
export interface PlanOffDayDto {
  date: string;
  /** A holiday on the weekly off day reads as the holiday. */
  reason: PlanOffDayReason;
  /** The holiday's name (several on one day joined with " / "); `null` for a weekly off. */
  name: string | null;
}

export interface MonthlyPlanDto extends PlanStateDto {
  id: string;
  userId: string;
  planMonth: string;
  /** Sorted by date, at most one per day. */
  entries: MonthlyPlanEntryDto[];
  /** The month's locked days for this employee, as they stand now (a holiday HR adds later shows up here). No entry may sit on one. */
  offDays: PlanOffDayDto[];
  revision: number;
  updatedAt: string;
}

/** A route as the plan screens name it. */
export interface PlanRouteDto {
  id: string;
  name: string;
  routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
}

/** `GET /planning/monthly/:id`: the plan, and every route its entries and amendments use. */
export interface MonthlyPlanDetailDto extends MonthlyPlanDto {
  /** Oldest first: what a manager or Admin changed while the plan waited, with the days each change replaced. */
  amendments: Array<Omit<PlanAmendmentDto, 'previous'> & { previous: MonthlyPlanEntryDto[] }>;
  routes: PlanRouteDto[];
}

/** `PATCH /planning/monthly/:id/amend`: the whole month as it should be (no stay/transit days), and why. */
export interface AmendMonthlyPlanDto {
  entries: Array<Pick<MonthlyPlanEntryDto, 'planDate' | 'workingType' | 'workWith' | 'routeIds' | 'remarks'> & { returnDate?: string }>;
  /** Why, if they said; may be empty. */
  reason?: string;
}

export type LateSubmitGrantStatus = 'OPEN' | 'USED' | 'REVOKED' | 'EXPIRED';

/** `GET /planning/late-grants`: a one-off exception that lets one employee submit one plan after its deadline. */
export interface LateSubmitGrantDto {
  id: string;
  userId: string;
  kind: 'DAILY_PLAN' | 'MONTHLY_PLAN';
  /** `YYYY-MM-DD` for a daily plan, `YYYY-MM` for a monthly one. */
  planKey: string;
  reason: string;
  grantedBy: string;
  grantedByRole: string;
  grantedAt: string;
  expiresAt: string;
  status: LateSubmitGrantStatus;
  usedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

/** `POST /planning/late-grants`. `expiresAt` (ISO date-time) is when the exception ends; left out, the default length applies. */
export interface GrantLateSubmitDto {
  userId: string;
  kind: 'DAILY_PLAN' | 'MONTHLY_PLAN';
  planKey: string;
  reason: string;
  expiresAt?: string;
}
