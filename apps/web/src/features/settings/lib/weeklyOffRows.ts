import { WEEKLY_OFF_WEEKDAYS, parseWeeklyOffSchedule, weeklyOffRulesFor, type WeeklyOffRule, type WeeklyOffWeekday } from '@greynote/contracts';

/**
 * The weekly off schedule of a setting as the control edits it: a set of rules per start date, each rule a weekday that is off every
 * week or only in some. The draft the screen keeps is the JSON the server stores, with anything half-typed (a date not chosen yet) left
 * as typed so the server's own rules can say what is wrong.
 */
export interface RuleRow {
  weekday: WeeklyOffWeekday;
  all: boolean;
  /** The occurrences (1 to 5) that are off; used while `all` is false. */
  weeks: number[];
}
export interface VersionRow {
  effectiveFrom: string;
  rules: RuleRow[];
}

const isWeekday = (v: unknown): v is WeeklyOffWeekday => typeof v === 'string' && (WEEKLY_OFF_WEEKDAYS as readonly string[]).includes(v);

/** The rows a stored (or half-edited) draft shows; an unreadable draft shows none. */
export function rowsFromDraft(draft: string): VersionRow[] {
  try {
    const raw: unknown = JSON.parse(draft);
    if (!Array.isArray(raw)) return [];
    return raw.map((v) => {
      const version = (v ?? {}) as Record<string, unknown>;
      const rules = Array.isArray(version['rules']) ? version['rules'] : [];
      return {
        effectiveFrom: typeof version['effectiveFrom'] === 'string' ? version['effectiveFrom'] : '',
        rules: rules.map((r): RuleRow => {
          const rule = (r ?? {}) as Record<string, unknown>;
          const weeks = Array.isArray(rule['weeks']) ? (rule['weeks'] as unknown[]).filter((w): w is number => typeof w === 'number') : [];
          return { weekday: isWeekday(rule['weekday']) ? rule['weekday'] : 'SUNDAY', all: rule['weeks'] === 'ALL', weeks };
        }),
      };
    });
  } catch {
    return [];
  }
}

export function draftFromRows(rows: readonly VersionRow[]): string {
  return JSON.stringify(
    rows.map((v) => ({ effectiveFrom: v.effectiveFrom, rules: v.rules.map((r) => ({ weekday: r.weekday, weeks: r.all ? 'ALL' : [...r.weeks].sort((a, b) => a - b) })) })),
  );
}

/** Turns one week chip on or off: choosing a number leaves "every week"; clearing the last number leaves none chosen. */
export function toggleWeek(rule: RuleRow, week: number): RuleRow {
  const base = rule.all ? [] : rule.weeks;
  return { ...rule, all: false, weeks: base.includes(week) ? base.filter((w) => w !== week) : [...base, week] };
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th'];
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const join = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** "every Sunday, 1st and 3rd Saturday". */
export function describeRules(rules: readonly WeeklyOffRule[]): string {
  if (rules.length === 0) return 'no weekly off';
  const ordered = [...rules].sort((a, b) => WEEKLY_OFF_WEEKDAYS.indexOf(a.weekday) - WEEKLY_OFF_WEEKDAYS.indexOf(b.weekday));
  return ordered.map((r) => (r.weeks === 'ALL' ? `every ${title(r.weekday)}` : `${join(r.weeks.map((w) => ORDINAL[w] ?? String(w)))} ${title(r.weekday)}`)).join(', ');
}

/** A stored value as one line: the rules in force today, and the next change if one is coming. */
export function summariseSchedule(value: string, today: string): string {
  const parsed = parseWeeklyOffSchedule(value);
  if (!parsed.ok) return value;
  const now = describeRules(weeklyOffRulesFor(today, parsed.schedule));
  const next = parsed.schedule.find((v) => v.effectiveFrom > today);
  return next ? `${now}; from ${next.effectiveFrom}: ${describeRules(next.rules)}` : now;
}

/** A new set to add: it has no date yet and copies the rules in force today, so the Admin changes only what differs. */
export function newVersionRow(schedule: readonly VersionRow[], today: string): VersionRow {
  const inForce = [...schedule].filter((v) => v.effectiveFrom !== '' && v.effectiveFrom <= today).pop();
  return { effectiveFrom: '', rules: (inForce?.rules ?? []).map((r) => ({ ...r, weeks: [...r.weeks] })) };
}
