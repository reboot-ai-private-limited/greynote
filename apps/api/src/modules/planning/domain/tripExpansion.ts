import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from './monthlyPlan.entity.js';
import { isFieldDay } from './plan.js';

const DAY_MS = 86_400_000;
const addDay = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * Turns each out-station trip's `returnDate` into its days: every day after the trip's first up to the one before the return is
 * a `STAY` entry, and the return day a `TRANSIT` entry, all copying the trip's working type, routes, colleagues and remarks.
 * Entries the server wrote earlier (`STAY`, `TRANSIT`) are dropped first and rebuilt, so saving a plan again with the
 * entries it was read with changes nothing, and editing or clearing a `returnDate` moves or removes its days.
 *
 * Refuses a `returnDate` that isn't after the trip's day or leaves the month, sits on a day that isn't field work, or runs over a
 * day the employee planned themselves (which also keeps two trips from overlapping). The out-station route check needs Territory
 * and is made at submit, with the other checks that read today's state.
 */
export function expandTrips(planMonth: string, entries: MonthlyPlanEntry[]): MonthlyPlanEntry[] {
  const own = entries.filter((e) => e.dayKind === 'NORMAL');
  const taken = new Set(own.map((e) => e.planDate));
  const out = [...own];
  own.forEach((trip) => {
    if (!trip.returnDate) return;
    const field = `entries.${entries.indexOf(trip)}.returnDate`;
    if (!isFieldDay(trip.workingType)) {
      throw AppError.badRequest('Only a field work or doctor campaign day can be an out-station trip.', { field });
    }
    if (trip.returnDate <= trip.planDate) {
      throw AppError.badRequest('The return date has to be after the day you leave. For a same-day return, leave it empty.', { field });
    }
    if (!trip.returnDate.startsWith(`${planMonth}-`)) {
      throw AppError.badRequest('The return date has to be in the same month as the plan.', { field });
    }
    for (let d = addDay(trip.planDate); d <= trip.returnDate; d = addDay(d)) {
      if (taken.has(d)) {
        throw AppError.badRequest('A day planned inside this trip overlaps it. Remove it or shorten the trip.', { field, planDate: d });
      }
      out.push({
        ...trip,
        planDate: d,
        returnDate: null,
        dayKind: d === trip.returnDate ? 'TRANSIT' : 'STAY',
      });
    }
  });
  return out.sort((a, b) => a.planDate.localeCompare(b.planDate));
}
