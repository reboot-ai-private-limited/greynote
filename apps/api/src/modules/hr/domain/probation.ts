import { daysInMonth, parseCalendarDate, formatCalendarDate } from '@/shared/time/businessTime.js';

/**
 * The first day after probation: the joining date plus `months`, clamped to the end of a shorter month (joining on 31 August with
 * 6 months → 28 February). Probation covers every date before it. Months of 0 means no probation (it ends the day it starts).
 */
export function probationEndsOn(joinedOn: string, months: number): string {
  const { year, month, day } = parseCalendarDate(joinedOn);
  const index = year * 12 + (month - 1) + months;
  const endYear = Math.floor(index / 12);
  const endMonth = (index % 12) + 1;
  return formatCalendarDate({ year: endYear, month: endMonth, day: Math.min(day, daysInMonth(endYear, endMonth)) });
}
