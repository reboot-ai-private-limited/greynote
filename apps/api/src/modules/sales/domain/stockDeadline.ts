import { addDays, businessDate, daysInMonth, formatCalendarDate, parseCalendarDate, parseCalendarMonth, zonedInstant } from '@/shared/time/businessTime.js';

/**
 * Month *M*'s stock counts are due by day `deadlineDay` (1-28) of the following month (decision-log 2026-10-03, sign-off E1
 * as amended). Returns the last millisecond of that day in the business timezone.
 */
export function stockDeadline(month: string, deadlineDay: number, timeZone: string): Date {
  const { year, month: m } = parseCalendarMonth(month);
  const lastDay = formatCalendarDate({ year, month: m, day: daysInMonth(year, m) });
  return zonedInstant(parseCalendarDate(addDays(lastDay, deadlineDay)), 23, 59, timeZone, 59_999);
}

export type MonthWindow = 'FUTURE' | 'OPEN' | 'CLOSED';

/** `FUTURE` before the month has begun, `OPEN` up to the deadline, `CLOSED` after it. */
export function monthWindow(month: string, now: Date, deadlineDay: number, timeZone: string): MonthWindow {
  if (businessDate(now, timeZone).slice(0, 7) < month) return 'FUTURE';
  return now.getTime() <= stockDeadline(month, deadlineDay, timeZone).getTime() ? 'OPEN' : 'CLOSED';
}
