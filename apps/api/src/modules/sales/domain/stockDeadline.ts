import { addDays, businessDate, daysInMonth, formatCalendarDate, parseCalendarMonth, DEFAULT_DAY_START, endOfBusinessDay } from '@/shared/time/businessTime.js';

/**
 * Month *M*'s stock counts are due by day `deadlineDay` (1-28) of the following month (decision-log 2026-10-03, sign-off E1
 * as amended). Returns the last millisecond of that day in the business timezone.
 */
export function stockDeadline(month: string, deadlineDay: number, timeZone: string, dayStart: string = DEFAULT_DAY_START): Date {
  const { year, month: m } = parseCalendarMonth(month);
  const lastDay = formatCalendarDate({ year, month: m, day: daysInMonth(year, m) });
  return endOfBusinessDay(addDays(lastDay, deadlineDay), dayStart, timeZone);
}

export type MonthWindow = 'FUTURE' | 'OPEN' | 'CLOSED';

/** `FUTURE` before the month has begun, `OPEN` up to the deadline, `CLOSED` after it. */
export function monthWindow(month: string, now: Date, deadlineDay: number, timeZone: string, dayStart: string = DEFAULT_DAY_START): MonthWindow {
  if (businessDate(now, timeZone, dayStart).slice(0, 7) < month) return 'FUTURE';
  return now.getTime() <= stockDeadline(month, deadlineDay, timeZone, dayStart).getTime() ? 'OPEN' : 'CLOSED';
}
