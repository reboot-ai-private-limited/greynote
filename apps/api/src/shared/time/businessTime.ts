/**
 * Calendar days and wall-clock times in the business timezone (`BUSINESS_TIMEZONE`), turned into
 * instants. The server runs in UTC and has no timezone of its own, so "10:00 on the 5th" only
 * means something once a timezone is named.
 *
 * Pure functions on `Intl` — no dependency. Malformed input throws a `RangeError`; callers that
 * read these values from Config turn that into their own error naming the key.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/** `YYYY-MM-DD`, rejecting impossible days like `2026-02-30`. */
export function parseCalendarDate(value: string): CalendarDate {
  const m = DATE_RE.exec(value);
  if (!m) throw new RangeError(`Not a YYYY-MM-DD date: ${value}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`No such date: ${value}`);
  }
  return { year, month, day };
}

/** `YYYY-MM`. */
export function parseCalendarMonth(value: string): { year: number; month: number } {
  const m = MONTH_RE.exec(value);
  if (!m) throw new RangeError(`Not a YYYY-MM month: ${value}`);
  const [year, month] = [Number(m[1]), Number(m[2])];
  if (month < 1 || month > 12) throw new RangeError(`No such month: ${value}`);
  return { year, month };
}

/** `HH:mm`, 24-hour. */
export function parseTimeOfDay(value: string): { hour: number; minute: number } {
  const m = TIME_RE.exec(value);
  if (!m) throw new RangeError(`Not an HH:mm time: ${value}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Throws a `RangeError` for a name `Intl` doesn't know. */
export function assertTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat('en-US', { timeZone });
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function formatCalendarDate({ year, month, day }: CalendarDate): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** The wall-clock fields of `instant` as seen in `timeZone`. */
function wallClock(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** How far `timeZone` is ahead of UTC at `instant`, in ms. */
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The calendar day it is in `timeZone` at `now`, as `YYYY-MM-DD`. */
export function businessDate(now: Date, timeZone: string): string {
  const w = wallClock(now, timeZone);
  return formatCalendarDate({ year: w.year, month: w.month, day: w.day });
}

/**
 * The instant a wall-clock time on a calendar day happens in `timeZone`. Two passes, so a date
 * on the far side of a DST change still lands right (not that `Asia/Kolkata` has one).
 */
export function zonedInstant(date: CalendarDate, hour: number, minute: number, timeZone: string, ms = 0): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0, ms);
  const first = naive - offsetMs(new Date(naive), timeZone);
  return new Date(naive - offsetMs(new Date(first), timeZone));
}

/** A Daily Plan is due at `cutoffTime` (`HH:mm`) on its own date. */
export function dailyPlanDeadline(planDate: string, cutoffTime: string, timeZone: string): Date {
  const { hour, minute } = parseTimeOfDay(cutoffTime);
  return zonedInstant(parseCalendarDate(planDate), hour, minute, timeZone);
}

/**
 * A Monthly Plan is due by the end of day `cutoffDay` of the month before `planMonth`. A day past
 * that month's end means its last day (30 in February → the 28th or 29th). Returns the last
 * millisecond of that day.
 */
export function monthlyPlanDeadline(planMonth: string, cutoffDay: number, timeZone: string): Date {
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
    throw new RangeError(`Not a day of the month: ${cutoffDay}`);
  }
  const { year, month } = parseCalendarMonth(planMonth);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const day = Math.min(cutoffDay, daysInMonth(prevYear, prevMonth));
  return zonedInstant({ year: prevYear, month: prevMonth, day }, 23, 59, timeZone, 59_999);
}
