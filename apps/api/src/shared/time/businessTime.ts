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

export const DEFAULT_DAY_START = '00:00';

/**
 * The business day `now` belongs to in `timeZone`, as `YYYY-MM-DD`. A day runs from `dayStart`
 * (`HH:mm`, default midnight) to the next `dayStart`, so with `02:00` the instant 01:30 on the 11th
 * is still the 10th.
 */
export function businessDate(now: Date, timeZone: string, dayStart: string = DEFAULT_DAY_START): string {
  const { hour, minute } = parseTimeOfDay(dayStart);
  const shifted = new Date(now.getTime() - (hour * 60 + minute) * 60_000);
  const w = wallClock(shifted, timeZone);
  return formatCalendarDate({ year: w.year, month: w.month, day: w.day });
}

/** The instant business day `date` begins: `dayStart` on that calendar date in `timeZone`. */
export function dayStartInstant(date: CalendarDate, dayStart: string, timeZone: string): Date {
  const { hour, minute } = parseTimeOfDay(dayStart);
  return zonedInstant(date, hour, minute, timeZone);
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

/** The last millisecond of business day `date`: one before the next day starts. */
export function endOfBusinessDay(date: string, dayStart: string, timeZone: string): Date {
  return new Date(dayStartInstant(parseCalendarDate(addDays(date, 1)), dayStart, timeZone).getTime() - 1);
}

/** A Daily Plan is due at `cutoffTime` (`HH:mm`) on its own date. */
export function dailyPlanDeadline(planDate: string, cutoffTime: string, timeZone: string): Date {
  const { hour, minute } = parseTimeOfDay(cutoffTime);
  return zonedInstant(parseCalendarDate(planDate), hour, minute, timeZone);
}

/**
 * A Monthly Plan is due by the end of day `cutoffDay` of the month before `planMonth`. A day past
 * that month's end means its last day (30 in February → the 28th or 29th). Returns the last
 * millisecond of that business day.
 */
export function monthlyPlanDeadline(planMonth: string, cutoffDay: number, timeZone: string, dayStart: string = DEFAULT_DAY_START): Date {
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
    throw new RangeError(`Not a day of the month: ${cutoffDay}`);
  }
  const { year, month } = parseCalendarMonth(planMonth);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const day = Math.min(cutoffDay, daysInMonth(prevYear, prevMonth));
  // The business day ends the moment the next one starts: 01:59:59.999 the next morning with a 02:00 day start.
  return endOfBusinessDay(formatCalendarDate({ year: prevYear, month: prevMonth, day }), dayStart, timeZone);
}

export const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
] as const;
export const WEEKDAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

/** `APRIL` → 4. */
export function parseMonthName(value: string): number {
  const index = MONTH_NAMES.indexOf(value as (typeof MONTH_NAMES)[number]);
  if (index < 0) throw new RangeError(`Not a month name: ${value}`);
  return index + 1;
}

export function parseWeekdayName(value: string): WeekdayName {
  if (!WEEKDAY_NAMES.includes(value as WeekdayName)) throw new RangeError(`Not a weekday name: ${value}`);
  return value as WeekdayName;
}

const toUtc = (date: string) => {
  const { year, month, day } = parseCalendarDate(date);
  return Date.UTC(year, month - 1, day);
};
const fromUtc = (ms: number) => {
  const d = new Date(ms);
  return formatCalendarDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
};

/** Calendar arithmetic on `YYYY-MM-DD` — no timezone involved. */
export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** Every date from `from` to `to`, both inclusive. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let ms = toUtc(from); ms <= toUtc(to); ms += 86_400_000) dates.push(fromUtc(ms));
  return dates;
}

export function weekdayOf(date: string): WeekdayName {
  return WEEKDAY_NAMES[new Date(toUtc(date)).getUTCDay()]!;
}

/**
 * The leave (financial) year a date falls in, named by the year it starts in: with an April start,
 * 2027-03-31 is in 2026 and 2027-04-01 in 2027.
 */
export function leaveYearOf(date: string, startMonth: number): number {
  const { year, month } = parseCalendarDate(date);
  return month >= startMonth ? year : year - 1;
}

/** First and last day of a leave year. */
export function leaveYearRange(year: number, startMonth: number): { from: string; to: string } {
  const from = formatCalendarDate({ year, month: startMonth, day: 1 });
  return { from, to: addDays(formatCalendarDate({ year: year + 1, month: startMonth, day: 1 }), -1) };
}

/** The first and last day of a month (`YYYY-MM`), as dates. */
export function monthRange(month: string): { from: string; to: string } {
  const { year, month: m } = parseCalendarMonth(month);
  return { from: formatCalendarDate({ year, month: m, day: 1 }), to: formatCalendarDate({ year, month: m, day: daysInMonth(year, m) }) };
}
