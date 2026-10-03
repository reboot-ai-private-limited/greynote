import type { CreateHolidayDto, HolidayDto, HolidayScope } from '@greynote/contracts';
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
  date: string;
  scope: HolidayScope | '';
  zoneIds: string[];
  hqIds: string[];
}

export const EMPTY_HOLIDAY: HolidayDraft = { name: '', date: '', scope: '', zoneIds: [], hqIds: [] };


/**
 * Same rules as the API: a national holiday carries no places, a Zone holiday needs a Zone and no HQs, an HQ holiday
 * needs an HQ and no Zones. Picking a scope clears the other list, so the form never sends a mix.
 */
export function buildHoliday(draft: HolidayDraft): BuildResult<CreateHolidayDto> {
  const name = squash(draft.name);
  const errors = {
    name: name === '' ? 'Enter a name.' : name.length > NAME_MAX ? `Keep the name to ${NAME_MAX} characters.` : undefined,
    date: draft.date === '' ? 'Choose a date.' : isRealDate(draft.date) ? undefined : 'Enter a real date.',
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
      scope: draft.scope,
      zoneIds: draft.scope === 'ZONE' ? [...new Set(draft.zoneIds)] : [],
      hqIds: draft.scope === 'HQ' ? [...new Set(draft.hqIds)] : [],
    },
  };
}

/** Switching scope drops the ids of the one that no longer applies. */
export function withScope(draft: HolidayDraft, scope: HolidayScope): HolidayDraft {
  return { ...draft, scope, zoneIds: scope === 'ZONE' ? draft.zoneIds : [], hqIds: scope === 'HQ' ? draft.hqIds : [] };
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Holidays grouped by month, in date order: `{ month: '2026-10', items }`. */
export function groupByMonth(holidays: readonly HolidayDto[]): { month: string; items: HolidayDto[] }[] {
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const groups = new Map<string, HolidayDto[]>();
  for (const h of sorted) groups.set(h.date.slice(0, 7), [...(groups.get(h.date.slice(0, 7)) ?? []), h]);
  return [...groups].map(([month, items]) => ({ month, items }));
}

/** `Zone: West Bengal, Assam`, `HQ: Siliguri`, `All employees`: who a holiday applies to, in words. */
export function appliesTo(holiday: Pick<HolidayDto, 'scope' | 'zoneIds' | 'hqIds'>, zoneName: (id: string) => string, hqName: (id: string) => string): string {
  if (holiday.scope === 'NATIONAL') return 'All employees';
  if (holiday.scope === 'ZONE') return `Zone: ${holiday.zoneIds.map(zoneName).join(', ')}`;
  return `HQ: ${holiday.hqIds.map(hqName).join(', ')}`;
}
