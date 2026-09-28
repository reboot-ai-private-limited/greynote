import type { ApprovalRequest } from '@/modules/approval/approval.public.js';

/** How long a rejected Plan may still be resubmitted past its deadline (decision-log 2026-09-28). */
export interface ResubmitPolicy {
  /** Grace after the rejection. */
  graceMs: number;
  /** No window runs past this: 11:30 on a Daily Plan's date, the start of a Monthly Plan's month. */
  latest: Date;
  /** Window resubmits allowed per Plan. */
  max: number;
}

/**
 * When the after-rejection window closes, or `null` if there's none: the Plan isn't `REJECTED`
 * (a withdraw or an Admin reopen opens no window), the Plan used up its window resubmits, or the
 * window ends before the deadline anyway. The end is the later of the deadline and rejection +
 * grace, capped at `latest`.
 */
export function resubmitWindowEnd(
  request: ApprovalRequest | null,
  deadline: Date,
  policy: ResubmitPolicy,
  lateResubmits: number,
): Date | null {
  if (request?.status !== 'REJECTED' || lateResubmits >= policy.max) return null;
  const rejection = [...request.history].reverse().find((a) => a.action === 'REJECT');
  if (!rejection) return null;
  const end = Math.min(Math.max(deadline.getTime(), rejection.at.getTime() + policy.graceMs), policy.latest.getTime());
  return end > deadline.getTime() ? new Date(end) : null;
}
