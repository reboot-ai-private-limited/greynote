import type { RoleName } from '@greynote/contracts';

/** Which deadline the exception lifts: the employee sending the month, or the manager approving it. */
export const EXPENSE_GRANT_PHASES = ['SUBMIT', 'APPROVE'] as const;
export type ExpenseGrantPhase = (typeof EXPENSE_GRANT_PHASES)[number];

export const EXPENSE_GRANT_STATUSES = ['OPEN', 'USED', 'REVOKED', 'EXPIRED'] as const;
export type ExpenseGrantStatus = (typeof EXPENSE_GRANT_STATUSES)[number];

/**
 * A one-off exception to a month of expenses' deadline (decision-log 2026-10-12, like the late Plan exception of sign-off B8): lets
 * one month be sent (`SUBMIT`) or approved (`APPROVE`) once, after the deadline, before `expiresAt`. Never granted once any row of
 * the month has been paid.
 */
export interface ExpenseMonthGrant {
  id: string;
  userId: string;
  /** `YYYY-MM` — the month the expenses were incurred in. */
  month: string;
  phase: ExpenseGrantPhase;
  reason: string;
  grantedBy: string;
  grantedByRole: RoleName;
  grantedAt: Date;
  expiresAt: Date;
  status: ExpenseGrantStatus;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

/** `EXPIRED` is only written lazily, so an `OPEN` row past `expiresAt` is expired too. */
export const effectiveExpenseGrantStatus = (grant: ExpenseMonthGrant, now: Date): ExpenseGrantStatus =>
  grant.status === 'OPEN' && grant.expiresAt <= now ? 'EXPIRED' : grant.status;
