import { AppError } from '@/shared/errors/AppError.js';
import { eachDate } from '@/shared/time/businessTime.js';
import type { MonthlyPlanEntry } from './monthlyPlan.entity.js';

/** A day the employee can't plan work on: their weekly off, or a holiday of their main HQ (HR decides which). */
export interface PlanOffDay {
  date: string;
  reason: 'WEEKLY_OFF' | 'HOLIDAY';
  /** The holiday's name; `null` for a weekly off. */
  name: string | null;
}

/** Planning's narrow view of HR's `listPlanOffDays`, handed in by the composition root once HR is built. */
export type PlanOffDaysSource = (userId: string, from: string, to: string) => Promise<PlanOffDay[]>;

const dayLabel = (date: string): string =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));

/** "Sun, 4 Oct is the weekly off" / "Fri, 2 Oct is a holiday (Gandhi Jayanti)". */
export const offDayText = (day: PlanOffDay): string =>
  day.reason === 'HOLIDAY' ? `${dayLabel(day.date)} is a holiday (${day.name})` : `${dayLabel(day.date)} is the weekly off`;

/** The refusal for a planned day on an off day: the day itself, or one a trip runs over. */
export function offDayError(day: PlanOffDay, field: string, onTrip: boolean): AppError {
  return onTrip
    ? AppError.badRequest(`The trip runs over ${offDayText(day)}, which can’t be planned. Change the trip’s dates.`, { field, date: day.date, reason: day.reason })
    : AppError.badRequest(`${offDayText(day)}, so it can’t be planned.`, { field, date: day.date, reason: day.reason });
}

const nextDay = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The last day a set of entries reaches: the month's last day, or later when a trip comes back next month. */
export const lastDayOf = (entries: readonly MonthlyPlanEntry[], monthEnd: string): string =>
  entries.reduce((last, e) => (e.returnDate && e.returnDate > last ? e.returnDate : last), monthEnd);

/**
 * Refuses the first planned day that is an off day: an entry the employee wrote (`entries.N.planDate`), or a day one of their
 * trips runs over, up to its return (`entries.N.returnDate`), wherever that day falls. Stay and transit rows are skipped: they
 * are rebuilt from a trip, and one carried in from last month's trip belongs to that month's plan. `N` is the entry's index
 * in the list given, so the error points at the row the employee sent.
 */
export function assertNoOffDays(entries: readonly MonthlyPlanEntry[], off: ReadonlyMap<string, PlanOffDay>): void {
  entries.forEach((e, i) => {
    if (e.dayKind !== 'NORMAL') return;
    const own = off.get(e.planDate);
    if (own) throw offDayError(own, `entries.${i}.planDate`, false);
    if (!e.returnDate || e.returnDate <= e.planDate) return;
    for (const date of eachDate(nextDay(e.planDate), e.returnDate)) {
      const hit = off.get(date);
      if (hit) throw offDayError(hit, `entries.${i}.returnDate`, true);
    }
  });
}

