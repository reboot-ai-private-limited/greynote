/**
 * One employee's days of one paid leave type in one leave year (named by its start year).
 * Available = allocated − used − pending; `pendingDays` are requested but not yet decided, so
 * two pending requests can't overdraw (decision-log 2026-09-28).
 */
export interface LeaveBalance {
  id: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
  /** Set when HR adjusted `allocatedDays` by hand. */
  adjustedBy: string | null;
  adjustedAt: Date | null;
  adjustReason: string | null;
}

export const availableDays = (b: Pick<LeaveBalance, 'allocatedDays' | 'usedDays' | 'pendingDays'>): number =>
  b.allocatedDays - b.usedDays - b.pendingDays;

/** Nearest half day. */
export const roundToHalfDay = (days: number): number => Math.round(days * 2) / 2;

/**
 * A grade's yearly default, for someone who joined on `joinedOn` (`YYYY-MM-DD`, or null if
 * unknown): the full days if they joined before the leave year, none if after it, otherwise the
 * share for the months from their joining month to the year's end (sign-off F13).
 */
export function proratedAllocation(defaultDays: number, leaveYear: { from: string; to: string }, joinedOn: string | null): number {
  if (!joinedOn || joinedOn <= leaveYear.from) return defaultDays;
  if (joinedOn > leaveYear.to) return 0;
  const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
  const monthsLeft = monthIndex(leaveYear.to) - monthIndex(joinedOn) + 1;
  return roundToHalfDay((defaultDays * monthsLeft) / 12);
}
