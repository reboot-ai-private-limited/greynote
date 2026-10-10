import type { PublicConfigDto } from '@greynote/contracts';

/**
 * The two server settings every date in the portal depends on: the month the financial year starts in, and the business timezone.
 * They are read from `GET /config/public` once a user is signed in and held here, so "today" and "this year" come out as the server
 * computes them instead of assuming April and Indian time. Until then (and if the read fails) the defaults apply, which are the
 * server's own seeded defaults.
 *
 * Module-level state, as with the selected financial year, so plain helpers (not only components) can read it.
 */
export const DEFAULT_FY_START_MONTH = 4;
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
export const DEFAULT_DAY_START = '00:00';

let fyStartMonth = DEFAULT_FY_START_MONTH;
let timeZone = DEFAULT_TIME_ZONE;
let dayStart = DEFAULT_DAY_START;

export const financialYearStartMonth = (): number => fyStartMonth;
export const businessTimeZone = (): string => timeZone;
/** `HH:mm`: when the business day rolls over (`02:00` = work at 01:00 still counts as the day before). */
export const businessDayStart = (): string => dayStart;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Takes what the server said. A value that is not usable is ignored and the previous one kept, never a broken date. */
export function setSiteConfig(
  config: Omit<PublicConfigDto, 'dayStartTime'> & { dayStartTime?: string | undefined },
): void {
  if (
    Number.isInteger(config.financialYearStartMonth) &&
    config.financialYearStartMonth >= 1 &&
    config.financialYearStartMonth <= 12
  ) {
    fyStartMonth = config.financialYearStartMonth;
  }
  if (isTimeZone(config.businessTimezone)) timeZone = config.businessTimezone;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(config.dayStartTime ?? '')) dayStart = config.dayStartTime!;
}

/** Back to the defaults: for tests, and for a sign-out so the next user does not inherit them. */
export function resetSiteConfig(): void {
  fyStartMonth = DEFAULT_FY_START_MONTH;
  timeZone = DEFAULT_TIME_ZONE;
  dayStart = DEFAULT_DAY_START;
}

/**
 * The UTC offset a timezone has on a calendar day, as `+05:30`, read at noon so a daylight-saving change in the small hours does not
 * matter. The API wants instants with an offset because the server has no business timezone of its own to guess.
 */
export function zoneOffset(date: string, zone: string = timeZone): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /^GMT([+-]\d{2}:\d{2})$/.exec(name);
  return match?.[1] ?? '+00:00';
}

/** Settings whose change moves every date in the portal: a page that already loaded them is stale and has to be reloaded. */
export const RELOAD_KEYS: readonly string[] = [
  'FY_START_MONTH',
  'BUSINESS_TIMEZONE',
  'DAY_START_TIME',
];
export const needsReload = (key: string): boolean => RELOAD_KEYS.includes(key);
