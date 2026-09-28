export const HOLIDAY_SCOPES = ['NATIONAL', 'ZONE', 'HQ'] as const;
export type HolidayScope = (typeof HOLIDAY_SCOPES)[number];

/**
 * A dated holiday. `NATIONAL` applies to everyone; `ZONE`/`HQ` to employees whose HQ (or its
 * Zone) is listed — one festival can span several. The weekly off day is a Config rule, not rows.
 */
export interface Holiday {
  id: string;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  scope: HolidayScope;
  zoneIds: string[];
  hqIds: string[];
  createdBy: string;
  createdAt: Date;
}

/** Does this holiday apply to an employee in this HQ/Zone (either may be unknown)? */
export function holidayApplies(holiday: Holiday, place: { hqId: string; zoneId: string } | null): boolean {
  if (holiday.scope === 'NATIONAL') return true;
  if (!place) return false;
  return holiday.scope === 'ZONE' ? holiday.zoneIds.includes(place.zoneId) : holiday.hqIds.includes(place.hqId);
}
