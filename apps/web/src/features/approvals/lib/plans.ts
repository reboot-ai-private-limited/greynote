import type { DailyPlanChangeDto, MonthlyPlanEntryDto, PlanDayDto } from '@greynote/contracts';
import { WORKING_TYPE_LABEL } from './review';

export interface PlanFieldChange {
  field: 'workingType' | 'routes' | 'workWith' | 'remarks';
  label: string;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Which parts of a planned day a change touches, in the order a reader looks for them. Order inside a list does not matter. */
export function changedFields(previous: PlanDayDto, proposed: PlanDayDto): PlanFieldChange[] {
  const out: PlanFieldChange[] = [];
  if (previous.workingType !== proposed.workingType) out.push({ field: 'workingType', label: 'Working type' });
  if (!sameSet(previous.routeIds, proposed.routeIds)) out.push({ field: 'routes', label: 'Routes' });
  if (!sameSet(previous.workWith, proposed.workWith)) out.push({ field: 'workWith', label: 'Worked with' });
  if ((previous.remarks ?? '') !== (proposed.remarks ?? '')) out.push({ field: 'remarks', label: 'Remarks' });
  return out;
}

/** What a list gains and loses: for the routes and colleagues of a change. */
export function listDiff(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[]; kept: string[] } {
  return {
    added: after.filter((x) => !before.includes(x)),
    removed: before.filter((x) => !after.includes(x)),
    kept: after.filter((x) => before.includes(x)),
  };
}

/**
 * Approving a change fails if the plan has moved on since it was asked for. An open change made against an older
 * revision than the plan's is therefore already doomed, and the reviewer should be told before they try.
 */
export function isStaleChange(change: Pick<DailyPlanChangeDto, 'open' | 'basedOnRevision'>, planRevision: number | undefined): boolean {
  return change.open && planRevision !== undefined && planRevision !== change.basedOnRevision;
}

export function changeStateLabel(change: Pick<DailyPlanChangeDto, 'open' | 'applied' | 'status'>): string {
  if (change.open) return 'Waiting for a decision';
  return change.applied ? 'Approved and applied to the plan' : change.status === 'REJECTED' ? 'Rejected' : 'Not applied';
}

/** A whole month at a glance: how many days of each working type. */
export function monthSummary(entries: readonly Pick<MonthlyPlanEntryDto, 'workingType'>[]): string {
  if (entries.length === 0) return 'No days planned.';
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.workingType, (counts.get(e.workingType) ?? 0) + 1);
  return [...counts]
    .map(([type, n]) => `${n} ${WORKING_TYPE_LABEL[type as keyof typeof WORKING_TYPE_LABEL] ?? type}`)
    .join(' · ');
}

/** `Mon 5 Oct`, for a plan's `YYYY-MM-DD` day, whatever the browser's zone. */
export function planDayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));
}

export function sortedEntries<T extends Pick<MonthlyPlanEntryDto, 'planDate'>>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.planDate.localeCompare(b.planDate));
}
