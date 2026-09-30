import { addDays, businessDate, daysInMonth, formatCalendarDate, parseCalendarDate, parseCalendarMonth, zonedInstant } from '@/shared/time/businessTime.js';

/**
 * Month *M*'s stock counts are due by the last calendar day of *M* (decision-log 2026-09-30, sign-off E1), plus
 * `graceDays` more. Returns the last millisecond of that day in the business timezone.
 */
export function stockDeadline(month: string, graceDays: number, timeZone: string): Date {
  const { year, month: m } = parseCalendarMonth(month);
  const lastDay = formatCalendarDate({ year, month: m, day: daysInMonth(year, m) });
  return zonedInstant(parseCalendarDate(addDays(lastDay, graceDays)), 23, 59, timeZone, 59_999);
}

export type MonthWindow = 'FUTURE' | 'OPEN' | 'CLOSED';

/** `FUTURE` before the month has begun, `OPEN` up to the deadline, `CLOSED` after it. */
export function monthWindow(month: string, now: Date, graceDays: number, timeZone: string): MonthWindow {
  if (businessDate(now, timeZone).slice(0, 7) < month) return 'FUTURE';
  return now.getTime() <= stockDeadline(month, graceDays, timeZone).getTime() ? 'OPEN' : 'CLOSED';
}
