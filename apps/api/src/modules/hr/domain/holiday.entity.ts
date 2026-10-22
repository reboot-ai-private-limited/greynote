export const HOLIDAY_SCOPES = ['NATIONAL', 'ZONE', 'HQ'] as const;
export type HolidayScope = (typeof HOLIDAY_SCOPES)[number];

/** The longest run of days one holiday can be added for (a festival week, Durga Puja …). */
export const MAX_HOLIDAY_DAYS = 31;

/**
 * A dated holiday: one row per day, so a range (2–8 Oct) is several rows sharing a `groupId`. `NATIONAL` applies to everyone; `ZONE`/`HQ` to employees whose HQ (or its
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
  /** Shared by the days of a holiday added as a range; `null` for a single day. */
  groupId: string | null;
  createdBy: string;
  createdAt: Date;
}

/** The HQs and Zones an employee covers (an MR's HQ, a ZSM's Zones …). */
export interface HolidayPlace {
  hqIds: string[];
  zoneIds: string[];
}

/** Does this holiday apply to an employee covering these HQs and Zones? One match is enough; `null` covers nothing. */
export function holidayApplies(holiday: Holiday, place: HolidayPlace | null): boolean {
  if (holiday.scope === 'NATIONAL') return true;
  if (!place) return false;
  return holiday.scope === 'ZONE' ? holiday.zoneIds.some((id) => place.zoneIds.includes(id)) : holiday.hqIds.some((id) => place.hqIds.includes(id));
}
