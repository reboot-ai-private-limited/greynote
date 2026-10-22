import { DAY_STATUSES, type DayStatus } from '@greynote/contracts';

export { DAY_STATUSES, type DayStatus };

/** What is known about one employee on one day. Every lookup is done by the caller; this file only judges. */
export interface DayFacts {
  /** `YYYY-MM-DD`. */
  date: string;
  /** The business date today, same format. */
  today: string;
  /** The day they joined (business date), or `null` when not recorded — then no day can be called absent. */
  joinedOn: string | null;
  /** The last day worked before a deactivation, or `null`. The days after it are not employed (decision-log 2026-10-22). */
  leftOn?: string | null;
  /** After a rehire, the first day back: not employed again from then. */
  rejoinedOn?: string | null;
  holiday: boolean;
  weeklyOff: boolean;
  /** Covered by a Manager-Approved or fully approved leave, paid or not (unpaid leave is deducted by Payroll's own leave line). */
  onLeave: boolean;
  /** The day's plan says Strike **and** the plan is past the manager (not a draft or a rejected one). */
  strikePlan: boolean;
  /** A submitted (or approved) daily report exists. */
  reported: boolean;
}

/**
 * The day's status, first match wins: before they joined → after they left (until a rejoining day) → not yet (a future day, or today with no report yet) → holiday → weekly off →
 * leave → strike → present (a report) → absent. A working day only becomes absent once it is over: today without a report is still "not yet".
 * Without a recorded joining date a would-be-absent day is `UNKNOWN`, never absent: a missing date must not cost anyone a month's pay.
 */
export function classifyDay(f: DayFacts): DayStatus {
  if (f.joinedOn !== null && f.date < f.joinedOn) return 'BEFORE_JOINING';
  if (f.leftOn && f.date > f.leftOn && (!f.rejoinedOn || f.date < f.rejoinedOn)) return 'NOT_EMPLOYED';
  if (f.date > f.today) return 'NOT_YET';
  if (f.holiday) return 'HOLIDAY';
  if (f.weeklyOff) return 'WEEKLY_OFF';
  if (f.onLeave) return 'LEAVE';
  if (f.strikePlan) return 'STRIKE';
  if (f.reported) return 'PRESENT';
  if (f.date === f.today) return 'NOT_YET';
  return f.joinedOn === null ? 'UNKNOWN' : 'ABSENT';
}

export interface DeductionSettings {
  absentDeducts: boolean;
  strikeDeducts: boolean;
}

/** Whether a day of this status costs salary under the settings. Holidays, weekly offs, leave and present days never do. */
export function isDeductible(status: DayStatus, settings: DeductionSettings): boolean {
  if (!settings.absentDeducts) return false;
  if (status === 'ABSENT') return true;
  return status === 'STRIKE' && settings.strikeDeducts;
}

export function emptyCounts(): Record<DayStatus, number> {
  return Object.fromEntries(DAY_STATUSES.map((s) => [s, 0])) as Record<DayStatus, number>;
}

export function countStatuses(statuses: readonly DayStatus[]): Record<DayStatus, number> {
  const counts = emptyCounts();
  for (const s of statuses) counts[s] += 1;
  return counts;
}

/** The days payroll would deduct. */
export function deductibleDays(statuses: readonly DayStatus[], settings: DeductionSettings): number {
  return statuses.filter((s) => isDeductible(s, settings)).length;
}
