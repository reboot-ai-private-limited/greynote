/**
 * The weekly off, as a schedule of rule sets that each start on a date. A rule names a weekday and which of its occurrences in the
 * month are off: every one (`ALL`) or only some ("1st and 3rd Saturday"). Stored in a system setting as JSON text, read by the API
 * (to count leave, classify attendance, lock plan days) and the web (to edit and list), so the rules live here once.
 */
export const WEEKLY_OFF_WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
export type WeeklyOffWeekday = (typeof WEEKLY_OFF_WEEKDAYS)[number];

export interface WeeklyOffRule {
  weekday: WeeklyOffWeekday;
  /** `ALL`, or the occurrences (1 to 5) of the weekday in a month that are off. The 1st Saturday is the Saturday on day 1 to 7. */
  weeks: 'ALL' | number[];
}

export interface WeeklyOffVersion {
  /** First date (`YYYY-MM-DD`) the rules apply to. They hold until the next version starts. */
  effectiveFrom: string;
  /** No rules: nothing is a weekly off from this date. */
  rules: WeeklyOffRule[];
}

/** Every Sunday, from the beginning of time. */
export const DEFAULT_WEEKLY_OFF_SCHEDULE = '[{"effectiveFrom":"1970-01-01","rules":[{"weekday":"SUNDAY","weeks":"ALL"}]}]';

export const MAX_WEEKLY_OFF_VERSIONS = 50;

/** One weekly off date in `GET /hr/weekly-offs`: the Holidays list shows it beside the holidays. */
export interface WeeklyOffDateDto {
  /** `YYYY-MM-DD`. */
  date: string;
  /** "Sunday" for an every-week day, "1st Saturday" for one that is off only in some weeks. */
  label: string;
}

export type WeeklyOffParse = { ok: true; schedule: WeeklyOffVersion[] } | { ok: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toUtc = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const isRealDate = (date: string): boolean => DATE_PATTERN.test(date) && new Date(toUtc(date)).toISOString().slice(0, 10) === date;
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Reads the stored text and checks the schedule hangs together. */
export function parseWeeklyOffSchedule(text: string): WeeklyOffParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The weekly off schedule is not valid.' };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Add at least one set of weekly off rules.' };
  if (raw.length > MAX_WEEKLY_OFF_VERSIONS) return { ok: false, error: `At most ${MAX_WEEKLY_OFF_VERSIONS} sets of rules.` };
  const schedule: WeeklyOffVersion[] = [];
  for (const [i, v] of raw.entries()) {
    const row = (v ?? {}) as Record<string, unknown>;
    const n = i + 1;
    const effectiveFrom = row['effectiveFrom'];
    if (typeof effectiveFrom !== 'string' || !isRealDate(effectiveFrom)) return { ok: false, error: `Set ${n}: enter the start date as YYYY-MM-DD.` };
    const prev = schedule[i - 1];
    if (prev && effectiveFrom <= prev.effectiveFrom) return { ok: false, error: `Set ${n}: it must start after set ${n - 1}.` };
    if (!Array.isArray(row['rules'])) return { ok: false, error: `Set ${n}: the rules are missing.` };
    const rules: WeeklyOffRule[] = [];
    for (const r of row['rules']) {
      const rule = (r ?? {}) as Record<string, unknown>;
      const weekday = rule['weekday'];
      if (typeof weekday !== 'string' || !(WEEKLY_OFF_WEEKDAYS as readonly string[]).includes(weekday)) {
        return { ok: false, error: `Set ${n}: use a weekday name, SUNDAY to SATURDAY.` };
      }
      if (rules.some((x) => x.weekday === weekday)) return { ok: false, error: `Set ${n}: ${weekday} is listed twice.` };
      const weeks = rule['weeks'];
      if (weeks === 'ALL') {
        rules.push({ weekday: weekday as WeeklyOffWeekday, weeks: 'ALL' });
        continue;
      }
      if (!Array.isArray(weeks) || weeks.length === 0 || weeks.some((w) => !Number.isInteger(w) || w < 1 || w > 5)) {
        return { ok: false, error: `Set ${n}: ${weekday} needs ALL, or weeks from 1 to 5.` };
      }
      rules.push({ weekday: weekday as WeeklyOffWeekday, weeks: [...new Set(weeks as number[])].sort((a, b) => a - b) });
    }
    schedule.push({ effectiveFrom, rules });
  }
  return { ok: true, schedule };
}

/** The stored text for a schedule. */
export const serialiseWeeklyOffSchedule = (schedule: readonly WeeklyOffVersion[]): string =>
  JSON.stringify(schedule.map((v) => ({ effectiveFrom: v.effectiveFrom, rules: v.rules.map((r) => ({ weekday: r.weekday, weeks: r.weeks })) })));

/** Which occurrence of its weekday in the month a date is: day 1 to 7 is the 1st, 8 to 14 the 2nd, and so on. */
export const weekOfMonth = (date: string): number => Math.ceil(Number(date.slice(8, 10)) / 7);

export const weekdayNameOf = (date: string): WeeklyOffWeekday => WEEKLY_OFF_WEEKDAYS[new Date(toUtc(date)).getUTCDay()]!;

/** The rules in force on a date: those of the latest set that has started. None before the first set. */
export function weeklyOffRulesFor(date: string, schedule: readonly WeeklyOffVersion[]): WeeklyOffRule[] {
  let current: WeeklyOffVersion | undefined;
  for (const v of schedule) if (v.effectiveFrom <= date) current = v;
  return current?.rules ?? [];
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th'];
const capitalise = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

/** "Sunday" or "1st Saturday" when the date is a weekly off, otherwise `null`. */
export function weeklyOffLabel(date: string, schedule: readonly WeeklyOffVersion[]): string | null {
  const weekday = weekdayNameOf(date);
  const rule = weeklyOffRulesFor(date, schedule).find((r) => r.weekday === weekday);
  if (!rule) return null;
  if (rule.weeks === 'ALL') return capitalise(weekday);
  const week = weekOfMonth(date);
  return rule.weeks.includes(week) ? `${ORDINALS[week]} ${capitalise(weekday)}` : null;
}

export const isWeeklyOff = (date: string, schedule: readonly WeeklyOffVersion[]): boolean => weeklyOffLabel(date, schedule) !== null;

/** Every weekly off from `from` to `to`, both inclusive, oldest first. */
export function weeklyOffsBetween(from: string, to: string, schedule: readonly WeeklyOffVersion[]): Array<{ date: string; label: string }> {
  const out: Array<{ date: string; label: string }> = [];
  for (let ms = toUtc(from); ms <= toUtc(to); ms += 86_400_000) {
    const date = fromUtc(ms);
    const label = weeklyOffLabel(date, schedule);
    if (label) out.push({ date, label });
  }
  return out;
}

/**
 * The one weekday that is off every week on a date, for readers that only know a single weekday (the phone's `weeklyOffDay`).
 * `SUNDAY` when the rules have no every-week day, as the old setting's default.
 */
export function everyWeekOffDay(date: string, schedule: readonly WeeklyOffVersion[]): WeeklyOffWeekday {
  return weeklyOffRulesFor(date, schedule).find((r) => r.weeks === 'ALL')?.weekday ?? 'SUNDAY';
}
