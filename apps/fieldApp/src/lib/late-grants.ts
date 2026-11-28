import { apiGet, apiPost } from './api';

/**
 * Late-submission exceptions (LLD planning.md): one employee may submit one plan after its deadline. Admin grants them for
 * anyone; a manager for their own team, and only while the `LATE_PLAN_GRANT_BY_MANAGER` setting is on (the server says so
 * when it is off). The employee sees theirs on the plan itself (`lateSubmitAllowedUntil`). Everything needs a connection.
 */
export type PlanKind = 'DAILY_PLAN' | 'MONTHLY_PLAN';
export type GrantStatus = 'OPEN' | 'USED' | 'REVOKED' | 'EXPIRED';

export type LateGrant = {
  id: string;
  /** The employee it was granted to. */
  userId: string;
  kind: PlanKind;
  /** `YYYY-MM-DD` for a Daily Plan, `YYYY-MM` for a Monthly Plan. */
  planKey: string;
  reason: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
  status: GrantStatus;
  usedAt: string | null;
  revokedAt: string | null;
};

export const GRANT_STATUS_LABEL: Record<GrantStatus, string> = {
  OPEN: 'Open — not used yet',
  USED: 'Used',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
};

/** How long an exception lasts from the moment it is granted (decision-log 2026-11-19): only these three. */
export type LateGrantDuration = '30m' | '1h' | '12h';

/** The grants I made, was given, or my team has — newest first (Admin sees everyone's). */
export const grantLateSubmit = (input: { userId: string; kind: PlanKind; planKey: string; reason: string; duration?: LateGrantDuration }) =>
  apiPost<LateGrant>('/planning/late-grants', { ...input, reason: input.reason.trim() }, { auth: true });

/* ───────────────────────── late expense months ───────────────────────── */

export type ExpensePhase = 'SUBMIT' | 'APPROVE';

export type ExpenseGrant = {
  id: string;
  userId: string;
  /** `YYYY-MM`. */
  month: string;
  phase: ExpensePhase;
  reason: string;
  grantedBy: string;
  expiresAt: string;
  status: GrantStatus;
  /** `OPEN` past `expiresAt` reads as `EXPIRED` here. */
  effectiveStatus: GrantStatus;
};

/** Exceptions that let one month of expenses be sent (SUBMIT) or approved (APPROVE) late. Admin: all; a manager: their own and their team's. */
export const grantExpenseLate = (input: { userId: string; month: string; phase: ExpensePhase; reason: string; duration?: LateGrantDuration }) =>
  apiPost<ExpenseGrant>('/field-activity/expense-grants', { ...input, reason: input.reason.trim() }, { auth: true });


/* ───────────────────────── one list of every kind (2026-11-28) ───────────────────────── */

/** Any late exception, as `GET /late-grants` returns it: plans, expenses and the rest, with the status as it stands now. */
export type AnyLateGrant = {
  id: string;
  userId: string;
  kind: 'DAILY_PLAN' | 'MONTHLY_PLAN' | 'EXPENSE_SUBMIT' | 'EXPENSE_APPROVE' | string;
  /** `YYYY-MM-DD` for a day, `YYYY-MM` for a month. */
  periodKey: string;
  reason: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
  status: GrantStatus;
};

/** Newest first, a page at a time; a manager reads their own and their team's. `kinds` narrows to some kinds, `status` to one status. */
export const listAnyLateGrants = (q: { userId?: string; kinds?: string[]; status?: GrantStatus; page: number; pageSize: number }) => {
  const params = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
  if (q.userId) params.set('userId', q.userId);
  if (q.status) params.set('status', q.status);
  if (q.kinds?.length === 1) params.set('kind', q.kinds[0]!);
  return apiGet<{ items: AnyLateGrant[]; total: number; page: number; totalPages: number }>(`/late-grants?${params.toString()}`, { auth: true });
};

/** Withdraws any unused exception — Admin or whoever granted it. */
export const revokeAnyLateGrant = (id: string) => apiPost<unknown>(`/late-grants/${id}/revoke`, {}, { auth: true });
