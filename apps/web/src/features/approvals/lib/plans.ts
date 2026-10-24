import type { AmendMonthlyPlanDto, MonthlyPlanEntryDto, PlanOffDayDto, PlanRouteDto } from '@greynote/contracts';
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

/** A day while it is being edited: a plan entry whose `returnDate` may be unset. */
export type DraftDay = Pick<MonthlyPlanEntryDto, 'workingType' | 'workWith' | 'routeIds' | 'remarks' | 'dayKind'> & { returnDate: string | null };

export const isTripDay = (kind: DraftDay['dayKind'] | undefined) => kind === 'STAY' || kind === 'TRANSIT';
const isFieldDay = (t: DraftDay['workingType']) => t === 'FIELD_WORK' || t === 'DOCTOR_CAMPAIGN';

export const draftsOf = (entries: readonly MonthlyPlanEntryDto[]): Record<string, DraftDay> =>
  Object.fromEntries(entries.map(({ planDate, ...day }) => [planDate, { ...day, returnDate: day.returnDate ?? null }]));

const sameSet = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
const sameDay = (a: DraftDay | undefined, b: DraftDay | undefined) =>
  !!a && !!b && a.workingType === b.workingType && (a.remarks ?? '') === (b.remarks ?? '') && a.returnDate === b.returnDate && sameSet(a.routeIds, b.routeIds) && sameSet(a.workWith, b.workWith);

/** The days the editor changed, added or removed against the plan as loaded. A trip's stay and return days follow their first day, so they are not counted. */
export function changedDates(original: Record<string, DraftDay>, edited: Record<string, DraftDay>): string[] {
  return [...new Set([...Object.keys(original), ...Object.keys(edited)])]
    .filter((d) => !isTripDay(original[d]?.dayKind) && !isTripDay(edited[d]?.dayKind) && !sameDay(original[d], edited[d]))
    .sort();
}

/** What the server takes (`PATCH /planning/monthly/:id/amend`): no stay/transit days, `returnDate` only on a trip's first day. */
export function amendEntries(edited: Record<string, DraftDay>): AmendMonthlyPlanDto['entries'] {
  return Object.keys(edited)
    .sort()
    .filter((d) => !isTripDay(edited[d]!.dayKind))
    .map((planDate) => {
      const { workingType, workWith, routeIds, remarks, returnDate } = edited[planDate]!;
      return { planDate, workingType, workWith, routeIds, remarks: remarks?.trim() ? remarks.trim() : null, ...(returnDate ? { returnDate } : {}) };
    });
}

/** The same day checks the employee's own plan makes, so a mistake is caught before the server says so; null when the day is fine. */
export function dayProblem(
  day: DraftDay,
  date: string,
  ctx: { routes: readonly PlanRouteDto[]; edited: Record<string, DraftDay>; offDates: readonly string[] },
): string | null {
  if (isFieldDay(day.workingType) && day.routeIds.length === 0) return 'Pick at least one route for a field day.';
  if (!day.returnDate) return null;
  if (!ctx.routes.some((r) => r.routeType === 'OUT_STATION' && day.routeIds.includes(r.id))) return 'A trip needs an out-station route. Add one, or clear the return date.';
  if (day.returnDate <= date) return 'The return date must be after the day they leave.';
  const clash = Object.keys(ctx.edited).find((d) => d > date && d <= day.returnDate! && !isTripDay(ctx.edited[d]!.dayKind) && !ctx.offDates.includes(d));
  if (clash) return `${planDayLabel(clash)} is already planned. Clear it, or choose an earlier return date.`;
  const locked = ctx.offDates.filter((d) => d > date && d <= day.returnDate!).sort()[0];
  if (locked) return `${planDayLabel(locked)} is a weekly off or holiday, so a trip can’t run over it.`;
  return null;
}

/** Puts a day into the month; a trip's old stay and return days go (the server writes the new ones on save). `day` null removes it. */
export function withDay(edited: Record<string, DraftDay>, date: string, day: DraftDay | null): Record<string, DraftDay> {
  const next = { ...edited };
  const oldReturn = edited[date]?.returnDate;
  if (day) next[date] = { ...day, dayKind: 'NORMAL' };
  else delete next[date];
  if (oldReturn) for (const d of Object.keys(next)) if (d > date && d <= oldReturn && isTripDay(next[d]!.dayKind)) delete next[d];
  return next;
}
