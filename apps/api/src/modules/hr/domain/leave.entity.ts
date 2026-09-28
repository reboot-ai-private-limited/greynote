import { eachDate, weekdayOf, type WeekdayName } from '@/shared/time/businessTime.js';

export const LEAVE_HALVES = ['FIRST', 'SECOND'] as const;
export type LeaveHalf = (typeof LEAVE_HALVES)[number];

/** One counted day of a leave. */
export interface LeaveDay {
  date: string;
  portion: 1 | 0.5;
}

/**
 * A leave request. Its approval state is the `LEAVE` `ApprovalRequest` whose `recordId` is this
 * `id`. `days` are counted at submit (off days and holidays excluded) and stored, so a later
 * holiday edit doesn't rewrite past leave. `isPaid` and `year` are fixed with it: they decide
 * which balance, if any, the ledger moves.
 */
export interface Leave {
  id: string;
  userId: string;
  leaveTypeId: string;
  isPaid: boolean;
  /** The leave year (by its start year) both dates fall in. */
  year: number;
  startDate: string;
  endDate: string;
  /** Only on a one-day leave. */
  half: LeaveHalf | null;
  reason: string;
  days: LeaveDay[];
  daysCount: number;
  /** Bumped on every edit; an edit is conditional on the revision it validated. */
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The days a leave counts (sign-off F12, F14): every date from start to end except the weekly off
 * day and holidays; a half-day leave counts 0.5.
 */
export function computeLeaveDays(
  startDate: string,
  endDate: string,
  half: LeaveHalf | null,
  weeklyOff: WeekdayName,
  holidays: Set<string>,
): LeaveDay[] {
  return eachDate(startDate, endDate)
    .filter((date) => weekdayOf(date) !== weeklyOff && !holidays.has(date))
    .map((date) => ({ date, portion: half ? 0.5 : 1 }));
}

/**
 * Two leaves of one person clash if their date ranges meet — except two half-day leaves on the
 * same date for different halves.
 */
export function leavesOverlap(
  a: Pick<Leave, 'startDate' | 'endDate' | 'half'>,
  b: Pick<Leave, 'startDate' | 'endDate' | 'half'>,
): boolean {
  if (a.startDate > b.endDate || b.startDate > a.endDate) return false;
  return !(a.half && b.half && a.startDate === b.startDate && a.half !== b.half);
}
