import type { PlanStatus } from '@/types/sync';

/**
 * "Today" and whether the MR may log field activity, decided on the phone from the last pull
 * (HLD 10). This is a UX gate only: the server re-checks every record at Submit and refuses one
 * the cache wrongly allowed (a manager may have rejected the plan since the last sync).
 */

/** Today's date (YYYY-MM-DD) in the business timezone; the phone's own date if that can't be worked out. */
export function businessToday(timeZone: string | null | undefined, now: Date = new Date()): string {
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
};

const PLAN_REASON: Record<PlanStatus | 'NONE', string> = {
  NONE: 'You have no Tour Plan for today. Submit your Daily Plan first.',
  DRAFT: 'Today’s Tour Plan is saved but not submitted yet. Submit it for approval.',
  SUBMITTED: 'Today’s Tour Plan is waiting for your manager’s approval.',
  REJECTED: 'Your manager rejected today’s Tour Plan. Update it and submit again.',
  WITHDRAWN: 'Today’s Tour Plan was withdrawn. Submit it again.',
  REOPENED: 'Today’s Tour Plan was reopened. Submit it again.',
  MANAGER_APPROVED: '',
  APPROVED: '',
};

export const BLOCKED_REASON =
  'Your account is blocked because daily reports were missed. You can still request leave and view reports — contact your Admin to clear the block.';

export function computeDayGate(input: {
  today: string;
  /** From the `planning` pull source; null when never pulled. */
  plans: { planDate: string; status: PlanStatus }[] | null;
  /** From the `fieldActivity` pull source; null when never pulled. */
  blocked: boolean | null;
}): DayGate {
  if (input.blocked === true) return { state: 'blocked', reason: BLOCKED_REASON, planStatus: null };
  if (input.plans === null || input.blocked === null) {
    return {
      state: 'unknown',
      reason: 'Connect to the internet once so your plan and data can load.',
      planStatus: null,
    };
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
export function dailyDeadlinePassed(planDate: string, today: string, nowHHmm: string, cutoffHHmm: string): boolean {
  if (planDate < today) return true;
  return planDate === today && nowHHmm > cutoffHHmm;
}

/** Whether a Monthly Plan's deadline (end of the cutoff day in the month before) has passed. A UX hint. */
export function monthlyDeadlinePassed(planMonth: string, today: string, cutoffDay: number): boolean {
  const before = addMonths(planMonth, -1);
  const lastDay = datesInMonth(before).length;
  const deadlineDay = Math.min(Math.max(cutoffDay, 1), lastDay);
  return today > fromParts(Number(before.slice(0, 4)), Number(before.slice(5)), deadlineDay);
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
