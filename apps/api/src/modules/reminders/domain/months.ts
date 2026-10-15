import { daysInMonth, parseCalendarMonth } from '@/shared/time/businessTime.js';

/** `YYYY-MM` shifted by whole months (negative goes back). */
export function addMonths(month: string, delta: number): string {
  const { year, month: m } = parseCalendarMonth(month);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthName = (month: string): string => {
  const { year, month: m } = parseCalendarMonth(month);
  return `${NAMES[m - 1]} ${year}`;
};

/** `7 Nov` from `YYYY-MM-DD`. */
export const shortDate = (date: string): string => `${Number(date.slice(8, 10))} ${NAMES[Number(date.slice(5, 7)) - 1]!.slice(0, 3)}`;

/** Day `day` of `month`, or its last day when the month is shorter (30 in February). */
export function clampedDate(month: string, day: number): string {
  const { year, month: m } = parseCalendarMonth(month);
  return `${month}-${String(Math.min(day, daysInMonth(year, m))).padStart(2, '0')}`;
}

export const monthOf = (date: string): string => date.slice(0, 7);
