import type { MonthlyPlanEntryDto } from '@greynote/contracts';
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
