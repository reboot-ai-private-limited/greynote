import { MAX_HOLIDAY_DAYS, type CreateHolidayDto, type HolidayDto, type HolidayScope, type WeeklyOffDateDto } from '@greynote/contracts';
import { isRealDate, rangeError } from '@/lib/dateRange';
import { fail, squash, type BuildResult } from '@/lib/forms';

// Kept here too, so the holiday screens import their date rules from one place.
export { rangeError };

export const HOLIDAY_SCOPE_LABEL: Record<HolidayScope, string> = {
  NATIONAL: 'National',
  ZONE: 'Zone',
  HQ: 'HQ',
};

export const NAME_MAX = 100;

export interface HolidayDraft {
  name: string;
  /** The first (or only) day. */
  date: string;
  /** The last day; empty or the same as `date`: a one-day holiday. */
  endDate: string;
  scope: HolidayScope | '';
  zoneIds: string[];
  hqIds: string[];
}

export const EMPTY_HOLIDAY: HolidayDraft = { name: '', date: '', endDate: '', scope: '', zoneIds: [], hqIds: [] };

const DAY_MS = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** How many days `from`…`to` covers, both included; `null` while either is missing or they're reversed. */
export function holidayDays(from: string, to: string): number | null {
  if (!isRealDate(from) || !isRealDate(to) || to < from) return null;
  return (utc(to) - utc(from)) / DAY_MS + 1;
}

function endDateError(draft: HolidayDraft): string | undefined {
  if (draft.endDate === '') return undefined;
  if (!isRealDate(draft.endDate)) return 'Enter a real date.';
  if (!isRealDate(draft.date)) return undefined;
  if (draft.endDate < draft.date) return 'The last day is before the first day.';
  return (holidayDays(draft.date, draft.endDate) ?? 0) > MAX_HOLIDAY_DAYS ? `A holiday can run at most ${MAX_HOLIDAY_DAYS} days.` : undefined;
}

/**
 * Same rules as the API: a national holiday carries no places, a Zone holiday needs a Zone and no HQs, an HQ holiday
 * needs an HQ and no Zones. Picking a scope clears the other list, so the form never sends a mix. A last day after the
 * first makes it a range (at most 31 days), which the API stores one row per day.
 */
export function buildHoliday(draft: HolidayDraft): BuildResult<CreateHolidayDto> {
  const name = squash(draft.name);
  const errors = {
    name: name === '' ? 'Enter a name.' : name.length > NAME_MAX ? `Keep the name to ${NAME_MAX} characters.` : undefined,
    date: draft.date === '' ? 'Choose a date.' : isRealDate(draft.date) ? undefined : 'Enter a real date.',
    endDate: endDateError(draft),
    scope: draft.scope === '' ? 'Choose who it applies to.' : undefined,
    zoneIds: draft.scope === 'ZONE' && draft.zoneIds.length === 0 ? 'Choose at least one zone.' : undefined,
    hqIds: draft.scope === 'HQ' && draft.hqIds.length === 0 ? 'Choose at least one HQ.' : undefined,
  };
  if (Object.values(errors).some(Boolean) || draft.scope === '') return fail(errors);
  return {
    ok: true,
    body: {
      name,
      date: draft.date,
      ...(draft.endDate !== '' && draft.endDate !== draft.date && { endDate: draft.endDate }),
      scope: draft.scope,
      zoneIds: draft.scope === 'ZONE' ? [...new Set(draft.zoneIds)] : [],
      hqIds: draft.scope === 'HQ' ? [...new Set(draft.hqIds)] : [],
    },
  };
}

/** The form's starting values for changing a holiday. A range is edited whole, so the days shown are the ones the list holds. */
export function draftOf(h: Pick<HolidayEntry, 'name' | 'from' | 'to' | 'scope' | 'zoneIds' | 'hqIds'>): HolidayDraft {
  return { name: h.name, date: h.from, endDate: h.to === h.from ? '' : h.to, scope: h.scope, zoneIds: [...h.zoneIds], hqIds: [...h.hqIds] };
}

/** Switching scope drops the ids of the one that no longer applies. */
export function withScope(draft: HolidayDraft, scope: HolidayScope): HolidayDraft {
  return { ...draft, scope, zoneIds: scope === 'ZONE' ? draft.zoneIds : [], hqIds: scope === 'HQ' ? draft.hqIds : [] };
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** One line of the calendar: a single day, or the days of a range (one row each on the server) shown together. */
export interface HolidayEntry {
  /** A day of it, for the delete call; with `groupId` set, deleting it as a group removes every day. */
  id: string;
  name: string;
  from: string;
  to: string;
  /** The days in view; a range cut by the list's dates shows only its days inside them. */
  days: number;
  groupId: string | null;
  scope: HolidayScope;
  zoneIds: string[];
  hqIds: string[];
}

/** Collapses each range's days into one entry, in date order (then by name). */
export function toEntries(holidays: readonly HolidayDto[]): HolidayEntry[] {
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const entries: HolidayEntry[] = [];
  const byGroup = new Map<string, HolidayEntry>();
  for (const h of sorted) {
    const grouped = h.groupId ? byGroup.get(h.groupId) : undefined;
    if (grouped) {
      grouped.to = h.date;
      grouped.days += 1;
      continue;
    }
    const entry: HolidayEntry = { id: h.id, name: h.name, from: h.date, to: h.date, days: 1, groupId: h.groupId, scope: h.scope, zoneIds: h.zoneIds, hqIds: h.hqIds };
    if (h.groupId) byGroup.set(h.groupId, entry);
    entries.push(entry);
  }
  return entries;
}

/** Holidays grouped by the month they start in, in date order: `{ month: '2026-10', items }`. */
export function groupByMonth(holidays: readonly HolidayDto[]): { month: string; items: HolidayEntry[] }[] {
  const groups = new Map<string, HolidayEntry[]>();
  for (const e of toEntries(holidays)) groups.set(e.from.slice(0, 7), [...(groups.get(e.from.slice(0, 7)) ?? []), e]);
  return [...groups].map(([month, items]) => ({ month, items }));
}

/** One line of the combined calendar: a holiday (editable) or a weekly off computed from the setting (read-only). */
export type CalendarRow = { kind: 'HOLIDAY'; entry: HolidayEntry } | { kind: 'WEEKLY_OFF'; date: string; label: string };
export type CalendarKind = 'ALL' | 'HOLIDAYS' | 'WEEKLY_OFFS';

/** A weekly off that is off only in some weeks ("1st Saturday") starts with the number; an every-week day ("Sunday") does not. */
export const isPartialWeeklyOff = (label: string): boolean => /^\d/.test(label);

/**
 * Holidays and weekly offs together by month, in date order. Every-week days (all the Sundays) are left out unless `showEveryWeek`,
 * so the list isn't flooded. `kind` narrows the list to one of the two.
 */
export function groupCalendarByMonth(
  holidays: readonly HolidayDto[],
  weeklyOffs: readonly WeeklyOffDateDto[],
  { kind, showEveryWeek }: { kind: CalendarKind; showEveryWeek: boolean },
): { month: string; rows: CalendarRow[] }[] {
  const rows: CalendarRow[] = [
    ...(kind === 'WEEKLY_OFFS' ? [] : toEntries(holidays).map((entry): CalendarRow => ({ kind: 'HOLIDAY', entry }))),
    ...(kind === 'HOLIDAYS' ? [] : weeklyOffs.filter((w) => showEveryWeek || isPartialWeeklyOff(w.label)).map((w): CalendarRow => ({ kind: 'WEEKLY_OFF', date: w.date, label: w.label }))),
  ];
  const start = (r: CalendarRow) => (r.kind === 'HOLIDAY' ? r.entry.from : r.date);
  rows.sort((a, b) => start(a).localeCompare(start(b)) || (a.kind === b.kind ? 0 : a.kind === 'HOLIDAY' ? -1 : 1));
  const groups = new Map<string, CalendarRow[]>();
  for (const r of rows) groups.set(start(r).slice(0, 7), [...(groups.get(start(r).slice(0, 7)) ?? []), r]);
  return [...groups].map(([month, items]) => ({ month, rows: items }));
}

const dayMonth = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const show = (format: Intl.DateTimeFormat, date: string) => format.format(new Date(utc(date)));

/** `2 Oct 2026`, `2 Oct – 8 Oct 2026`, or `29 Dec 2026 – 2 Jan 2027`. */
export function dateSpan(from: string, to: string): string {
  if (from === to) return show(dayMonthYear, from);
  return `${from.slice(0, 4) === to.slice(0, 4) ? show(dayMonth, from) : show(dayMonthYear, from)} – ${show(dayMonthYear, to)}`;
}

/** `Zone: West Bengal, Assam`, `HQ: Siliguri`, `All employees`: who a holiday applies to, in words. */
export function appliesTo(holiday: Pick<HolidayDto, 'scope' | 'zoneIds' | 'hqIds'>, zoneName: (id: string) => string, hqName: (id: string) => string): string {
  if (holiday.scope === 'NATIONAL') return 'All employees';
  if (holiday.scope === 'ZONE') return `Zone: ${holiday.zoneIds.map(zoneName).join(', ')}`;
  return `HQ: ${holiday.hqIds.map(hqName).join(', ')}`;
}
