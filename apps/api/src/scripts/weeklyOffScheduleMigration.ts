import { DEFAULT_WEEKLY_OFF_SCHEDULE, serialiseWeeklyOffSchedule, WEEKLY_OFF_WEEKDAYS, type WeeklyOffWeekday } from '@greynote/contracts';

export type WeeklyOffPlan =
  | { action: 'none'; reason: string }
  | { action: 'replace'; value: string; reason: string };

/**
 * Carries the old single `WEEKLY_OFF_DAY` over to the `WEEKLY_OFF_SCHEDULE` setting. The seed has already added the schedule at its default
 * (every Sunday) and never overwrites, so a company that had chosen another day would silently go back to Sunday: this writes that day as
 * the schedule's first set. A schedule an Admin has already edited is left alone. Pure: it plans, the script writes.
 */
export function planWeeklyOffSchedule(oldDay: string | null, currentSchedule: string | null): WeeklyOffPlan {
  if (currentSchedule === null) return { action: 'none', reason: 'WEEKLY_OFF_SCHEDULE is not seeded yet: re-run the seed first.' };
  if (currentSchedule !== DEFAULT_WEEKLY_OFF_SCHEDULE) return { action: 'none', reason: 'The schedule was already edited; left as it is.' };
  if (oldDay === null) return { action: 'none', reason: 'There is no old WEEKLY_OFF_DAY; the default (every Sunday) stands.' };
  const day = oldDay.trim().toUpperCase();
  if (!(WEEKLY_OFF_WEEKDAYS as readonly string[]).includes(day)) return { action: 'none', reason: `The old WEEKLY_OFF_DAY (${oldDay}) is not a weekday; left as the default.` };
  if (day === 'SUNDAY') return { action: 'none', reason: 'The old weekly off was Sunday, which is the default.' };
  const value = serialiseWeeklyOffSchedule([{ effectiveFrom: '1970-01-01', rules: [{ weekday: day as WeeklyOffWeekday, weeks: 'ALL' }] }]);
  return { action: 'replace', value, reason: `The old weekly off was ${day}.` };
}
