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
