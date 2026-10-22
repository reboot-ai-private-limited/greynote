import type { MonthlyPlanEntryDto, PlanOffDayDto } from '@greynote/contracts';
import { WORKING_TYPE_LABEL } from './review';

/** A whole month at a glance: how many days of each working type. */
export function monthSummary(entries: readonly Pick<MonthlyPlanEntryDto, 'workingType'>[]): string {
  if (entries.length === 0) return 'No days planned.';
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.workingType, (counts.get(e.workingType) ?? 0) + 1);
  return [...counts]
    .map(
      ([type, n]) => `${n} ${WORKING_TYPE_LABEL[type as keyof typeof WORKING_TYPE_LABEL] ?? type}`,
    )
    .join(' · ');
}

/** `Mon 5 Oct`, for a plan's `YYYY-MM-DD` day, whatever the browser's zone. */
export function planDayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function sortedEntries<T extends Pick<MonthlyPlanEntryDto, 'planDate'>>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((a, b) => a.planDate.localeCompare(b.planDate));
}

/** "Weekly off" or "Holiday · Durga Puja". */
export const offDayLabel = (day: PlanOffDayDto): string => (day.reason === 'HOLIDAY' ? `Holiday · ${day.name ?? ''}` : 'Weekly off');

/**
 * The month as the reviewer reads it: every planned day and every locked day (weekly off, holiday), in date order. A day can
 * have both only in a plan saved before the lock or before HR added the holiday; the screen flags it.
 */
export function monthRows<T extends Pick<MonthlyPlanEntryDto, 'planDate'>>(
  entries: readonly T[],
  offDays: readonly PlanOffDayDto[],
): Array<{ date: string; entry: T | null; off: PlanOffDayDto | null }> {
  const off = new Map(offDays.map((d) => [d.date, d]));
  const rows: Array<{ date: string; entry: T | null; off: PlanOffDayDto | null }> = entries.map((entry) => ({ date: entry.planDate, entry, off: off.get(entry.planDate) ?? null }));
  const planned = new Set(entries.map((e) => e.planDate));
  for (const d of offDays) if (!planned.has(d.date)) rows.push({ date: d.date, entry: null, off: d });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
