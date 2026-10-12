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

/** The grants I made, was given, or my team has — newest first (Admin sees everyone's). */
export const listLateGrants = (pageSize = 100) =>
  apiGet<{ items: LateGrant[]; total: number }>(`/planning/late-grants?pageSize=${pageSize}`, { auth: true });

export const grantLateSubmit = (input: { userId: string; kind: PlanKind; planKey: string; reason: string }) =>
  apiPost<LateGrant>('/planning/late-grants', { ...input, reason: input.reason.trim() }, { auth: true });

/** Withdraws a grant that has not been used — Admin or whoever granted it. */
export const revokeLateGrant = (id: string) => apiPost<unknown>(`/planning/late-grants/${id}/revoke`, {}, { auth: true });
