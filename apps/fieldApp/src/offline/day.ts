import type { PlanStatus, WeeklyOffRule, WeeklyOffVersion } from '@/types/sync';

/**
 * "Today" and whether the MR may log field activity, decided on the phone from the last pull
 * (HLD 10). This is a UX gate only: the server re-checks every record at Submit and refuses one
 * the cache wrongly allowed (a manager may have rejected the plan since the last sync).
 */

/** `HH:mm` as minutes after midnight; 0 (midnight, the old behaviour) for anything else. */
function dayStartMinutes(dayStart: string | null | undefined): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(dayStart ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/**
 * The business day (YYYY-MM-DD) in the business timezone; the phone's own date if that can't be worked out. The day rolls over at
 * `dayStart` (`DAY_START_TIME`, default midnight): with `02:00`, 01:30 on the 11th is still the 10th.
 */
export function businessToday(timeZone: string | null | undefined, now: Date = new Date(), dayStart?: string | null): string {
  now = new Date(now.getTime() - dayStartMinutes(dayStart) * 60_000);
  try {
    if (timeZone) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
    }
  } catch {
    // An unknown timezone or no Intl support: fall through to the phone's own date.
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export type DayGate = {
  /** `unknown`: nothing has been pulled yet (first launch, never online). */
  state: 'unknown' | 'blocked' | 'open' | 'closed';
  /** Why the day's calls and expenses are locked; null when open. */
  reason: string | null;
  planStatus: PlanStatus | null;
  /** Set when the month's Monthly Plan isn't approved (the server's `MONTHLY_PLAN_NOT_APPROVED`): screens offer a way to the Monthly Plan. */
  cause?: 'MONTHLY_PLAN';
};

const PLAN_REASON: Record<PlanStatus | 'NONE', string> = {
  NONE: 'There is no plan for today. Ask your manager.',
  DRAFT: 'Today’s Tour Plan isn’t submitted yet. Pick the day’s doctors and submit it for approval.',
  SUBMITTED: 'Today’s Tour Plan is waiting for your manager’s approval.',
  REJECTED: 'Your manager rejected today’s Tour Plan. Check the doctors and submit again.',
  WITHDRAWN: 'Today’s Tour Plan was withdrawn. Submit it again.',
  REOPENED: 'Today’s Tour Plan was reopened. Submit it again.',
  MANAGER_APPROVED: '',
  APPROVED: '',
};

export const BLOCKED_REASON =
  'You’re blocked for a missed daily report. Ask your manager or Admin to unblock you. You can still request leave and view reports.';

export function computeDayGate(input: {
  today: string;
  /** From the `planning` pull source; null when never pulled. */
  plans: { planDate: string; status: PlanStatus }[] | null;
  /** From the `fieldActivity` pull source; null when never pulled. */
  blocked: boolean | null;
  /** From the `planning` pull source; null when never pulled. */
  monthlyPlans?: { planMonth: string; status: PlanStatus }[] | null;
}): DayGate {
  if (input.blocked === true) return { state: 'blocked', reason: BLOCKED_REASON, planStatus: null };
  if (input.plans === null || input.blocked === null) {
    return {
      state: 'unknown',
      reason: 'Connect to the internet once so your plan and data can load.',
      planStatus: null,
    };
  }
  if (Array.isArray(input.monthlyPlans)) {
    const month = monthOf(input.today);
    const monthPlan = input.monthlyPlans.find((m) => m.planMonth === month);
    const isApproved = monthPlan?.status === 'MANAGER_APPROVED' || monthPlan?.status === 'APPROVED';
    if (!isApproved) {
      return {
        state: 'closed',
        reason: `Your tour plan for ${prettyMonth(month)} isn’t approved yet. Submit your Tour Plan first.`,
        // The status shown beside "Today's Tour Plan" is the day's own, not the month's.
        planStatus: input.plans.find((p) => p.planDate === input.today)?.status ?? null,
        cause: 'MONTHLY_PLAN',
      };
    }
  }
  const status = input.plans.find((p) => p.planDate === input.today)?.status ?? null;
  if (status === 'MANAGER_APPROVED' || status === 'APPROVED') {
    return { state: 'open', reason: null, planStatus: status };
  }
  return { state: 'closed', reason: PLAN_REASON[status ?? 'NONE'], planStatus: status };
}

/* ───────────────────────────── calendar helpers (YYYY-MM-DD, no time zones) ───────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const fromParts = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return fromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const monthOf = (iso: string) => iso.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function datesInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => fromParts(y, m, i + 1));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayName = (iso: string) => WEEKDAYS[weekdayOf(iso)]!;

/** "Wed 7 Oct". */
export function prettyDay(iso: string): string {
  const [, m, d] = parts(iso);
  return `${weekdayName(iso)} ${d} ${MONTHS[m - 1]}`;
}

/** "October 2026". */
export function prettyMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
}

/** The weekly off day setting ("SUNDAY", "Sunday"…) as a weekday number, or null if unset. */
export function weeklyOffIndex(setting: string | null | undefined): number | null {
  if (!setting) return null;
  const i = WEEKDAYS.findIndex((w) => setting.toLowerCase().startsWith(w.toLowerCase()));
  return i === -1 ? null : i;
}

const FULL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/** The rules in force on a date: those of the latest set that has started (docs/mobile/holidays.md rule 3). */
function rulesOn(iso: string, schedule: WeeklyOffVersion[]): WeeklyOffRule[] {
  let best: WeeklyOffVersion | null = null;
  for (const v of schedule) if (v.effectiveFrom <= iso && (!best || v.effectiveFrom > best.effectiveFrom)) best = v;
  return best?.rules ?? [];
}

/** The label of the weekly off a date falls on ("Weekly off", "1st Saturday"), or null when it is a working day. */
export function weeklyOffLabel(iso: string, schedule: WeeklyOffVersion[] | null | undefined): string | null {
  if (!schedule?.length) return null;
  const day = weekdayOf(iso);
  const week = Math.ceil(Number(iso.slice(8, 10)) / 7);
  for (const r of rulesOn(iso, schedule)) {
    if (weeklyOffIndex(r.weekday) !== day) continue;
    if (r.weeks === 'ALL') return 'Weekly off';
    if (r.weeks.includes(week)) return `${ORDINALS[week - 1]} ${FULL_WEEKDAYS[day]}`;
  }
  return null;
}

/** "every Sunday, 1st and 3rd Saturday" for the rules in force on a date; null when there are none. */
export function describeWeeklyOff(iso: string, schedule: WeeklyOffVersion[] | null | undefined): string | null {
  const rules = schedule?.length ? rulesOn(iso, schedule) : [];
  const every = rules.filter((r) => r.weeks === 'ALL').map((r) => `every ${titleCase(r.weekday)}`);
  const some = rules.filter((r) => r.weeks !== 'ALL').map((r) => `${(r.weeks as number[]).map((w) => ORDINALS[w - 1]).join(' and ')} ${titleCase(r.weekday)}`);
  const parts = [...every, ...some];
  return parts.length ? parts.join(', ') : null;
}

const titleCase = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);

/** The current wall-clock time ("HH:mm") in the business timezone. */
/** The current time in ms. A function of its own so a screen can read the clock without calling `Date.now()` straight in render. */
export const nowMs = (): number => Date.now();

export function businessNowHHmm(timeZone: string | null | undefined, now: Date = new Date()): string {
  try {
    if (timeZone) {
      const t = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
      if (/^\d{2}:\d{2}$/.test(t)) return t;
    }
  } catch {
    // fall through to the phone's own time
  }
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Whether a Daily Plan's own submit deadline (cutoff time on its date) has already passed. A UX hint; the server decides. */
export function dailyDeadlinePassed(planDate: string, today: string, nowHHmm: string, cutoffHHmm: string, dayStart?: string | null): boolean {
  if (planDate < today) return true;
  // Before the day start the clock is already past midnight of a business day that began yesterday: its cutoff has gone.
  if (planDate === today && dayStart && nowHHmm < dayStart) return true;
  return planDate === today && nowHHmm > cutoffHHmm;
}

/** Whether a Monthly Plan's deadline (end of the cutoff day in the month before) has passed. A UX hint. */
export function monthlyDeadlinePassed(planMonth: string, today: string, cutoffDay: number): boolean {
  const before = addMonths(planMonth, -1);
  const lastDay = datesInMonth(before).length;
  const deadlineDay = Math.min(Math.max(cutoffDay, 1), lastDay);
  return today > fromParts(Number(before.slice(0, 4)), Number(before.slice(5)), deadlineDay);
}

/** The system's default stock deadline day, used until the phone has the setting. */
export const DEFAULT_STOCK_DEADLINE_DAY = 5;

/** Reads the stock deadline day from the synced settings, falling back to the default. */
export function stockDeadlineDay(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : DEFAULT_STOCK_DEADLINE_DAY;
}

/**
 * The month whose stock is still being counted today: the previous month until the deadline day of this month has
 * passed, then this month. (With a deadline of 5, 1-5 Nov shows October and 6 Nov onwards shows November.)
 */
export function stockMonthToCount(today: string, deadlineDay: number): string {
  const thisMonth = monthOf(today);
  return Number(today.slice(8, 10)) <= deadlineDay ? addMonths(thisMonth, -1) : thisMonth;
}

/** Whether a month's stock deadline (end of the deadline day in the month after it) has passed. A UX hint; the server decides. */
export function stockMonthClosed(month: string, today: string, deadlineDay: number): boolean {
  const after = addMonths(month, 1);
  return today > fromParts(Number(after.slice(0, 4)), Number(after.slice(5)), deadlineDay);
}

/** "Thu 8 Oct, 10:00" for an instant, in the business timezone (the phone's own if that is unknown). */
export function formatWhen(iso: string, timeZone?: string | null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, ...(timeZone ? { timeZone } : {}) }).format(date).replace(',', '');
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(date).replace(',', '');
  }
}
