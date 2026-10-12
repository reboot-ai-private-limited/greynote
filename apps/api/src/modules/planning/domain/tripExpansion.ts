import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from './monthlyPlan.entity.js';
import { isFieldDay } from './plan.js';

const DAY_MS = 86_400_000;
const addDay = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** `YYYY-MM` shifted by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const n = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5)) - 1) + delta;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}

/** The days a trip makes after its first, `STAY` up to the one before the return and `TRANSIT` on it, copying the trip. */
function tripDays(trip: MonthlyPlanEntry): MonthlyPlanEntry[] {
  const out: MonthlyPlanEntry[] = [];
  for (let d = addDay(trip.planDate); d <= trip.returnDate!; d = addDay(d)) {
    out.push({ ...trip, planDate: d, returnDate: null, dayKind: d === trip.returnDate ? 'TRANSIT' : 'STAY' });
  }
  return out;
}

/**
 * The days an earlier month's trips leave in `planMonth` — a trip that set out last month and comes back in this one. Read from
 * the earlier plan's trip entries, which are the only record of the trip.
 */
export function carriedInto(planMonth: string, earlierEntries: MonthlyPlanEntry[]): MonthlyPlanEntry[] {
  return earlierEntries
    .filter((e) => e.dayKind === 'NORMAL' && e.returnDate !== null && e.returnDate.startsWith(`${planMonth}-`) && !e.planDate.startsWith(`${planMonth}-`))
    .flatMap((trip) => tripDays(trip).filter((d) => d.planDate.startsWith(`${planMonth}-`)));
}

/**
 * Turns each out-station trip's `returnDate` into its days: every day after the trip's first up to the one before the return is
 * a `STAY` entry, and the return day a `TRANSIT` entry, all copying the trip's working type, routes, colleagues and remarks.
 * Entries the server wrote earlier (`STAY`, `TRANSIT`) are not in `typed`; they're rebuilt, so saving a plan again with the
 * entries it was read with changes nothing, and editing or clearing a `returnDate` moves or removes its days.
 *
 * A trip may come back in the month after `planMonth`: its days there are returned as `spill`, for the next month's plan.
 * `carriedIn` is the other way round — days of a trip from the month before, already worked out by `carriedInto`; they join the
 * entries, and the employee can't plan anything else on them.
 *
 * Refuses a `returnDate` that isn't after the trip's day or is more than a month on, a trip that is not field work, or one that runs
 * over a day the employee planned themselves (which also keeps two trips from overlapping). The out-station route check needs Territory
 * and is made at submit, with the other checks that read today's state.
 */
export function expandTrips(
  planMonth: string,
  typed: MonthlyPlanEntry[],
  carriedIn: MonthlyPlanEntry[] = [],
): { entries: MonthlyPlanEntry[]; spill: MonthlyPlanEntry[] } {
  const taken = new Set([...typed.map((e) => e.planDate), ...carriedIn.map((e) => e.planDate)]);
  carriedIn.forEach((c) => {
    const i = typed.findIndex((e) => e.planDate === c.planDate);
    if (i >= 0) {
      throw AppError.badRequest('That day is part of a trip from last month, so it can’t be planned separately. Shorten the trip first.', {
        field: `entries.${i}.planDate`,
      });
    }
  });
  const entries = [...typed, ...carriedIn];
  const spill: MonthlyPlanEntry[] = [];
  typed.forEach((trip, i) => {
    if (!trip.returnDate) return;
    const field = `entries.${i}.returnDate`;
    if (!isFieldDay(trip.workingType)) {
      throw AppError.badRequest('Only a field work or doctor campaign day can be an out-station trip.', { field });
    }
    if (trip.returnDate <= trip.planDate) {
      throw AppError.badRequest('The return date has to be after the day you leave. For a same-day return, leave it empty.', { field });
    }
    if (trip.returnDate.slice(0, 7) > shiftMonth(planMonth, 1)) {
      throw AppError.badRequest('A trip can come back in this month or the next, not later.', { field });
    }
    for (const day of tripDays(trip)) {
      if (!day.planDate.startsWith(`${planMonth}-`)) {
        spill.push(day);
      } else if (taken.has(day.planDate)) {
        throw AppError.badRequest('A day planned inside this trip overlaps it. Remove it or shorten the trip.', { field, planDate: day.planDate });
      } else {
        entries.push(day);
        taken.add(day.planDate);
      }
    }
  });
  const byDate = (a: MonthlyPlanEntry, b: MonthlyPlanEntry) => a.planDate.localeCompare(b.planDate);
  return { entries: entries.sort(byDate), spill: spill.sort(byDate) };
}
