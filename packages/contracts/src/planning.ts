/**
 * Plans over HTTP, as the approval previews read them. Dates are ISO strings on the wire; `planDate` is a
 * calendar day (`YYYY-MM-DD`), `planMonth` a month (`YYYY-MM`).
 */
import type { WorkingType } from './sync.js';

/** One planned day, whether a daily plan's body or one entry of a monthly plan. */
export interface PlanDayDto {
  workingType: WorkingType;
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
  /** `MONTHLY`: written from the approved monthly plan — the owner submits it as it is and can't edit it. */
  source: 'MANUAL' | 'MONTHLY';
  /** Oldest first. */
  amendments: PlanAmendmentDto[];
  /** Bumped on every save. */
  revision: number;
  updatedAt: string;
}

export interface MonthlyPlanEntryDto extends PlanDayDto {
  planDate: string;
}

export interface MonthlyPlanDto extends PlanStateDto {
  id: string;
  userId: string;
  planMonth: string;
  /** Sorted by date, at most one per day. */
  entries: MonthlyPlanEntryDto[];
  revision: number;
  updatedAt: string;
}

/** `GET /planning/changes/:id`: an in-day change to an approved daily plan. */
export interface DailyPlanChangeDto {
  id: string;
  planId: string;
  userId: string;
  planDate: string;
  /** The plan as it was when the change was asked for: what the approver compares against. */
  previous: PlanDayDto;
  proposed: PlanDayDto;
  reason: string;
  /** The plan revision it was made against; approving it fails if the plan has moved on. */
  basedOnRevision: number;
  open: boolean;
  /** Approved and written into the plan. */
  applied: boolean;
  createdAt: string;
  status: string;
  approval: { requestId: string; cycle: number; submittedAt: string; decidedAt: string | null } | null;
}
