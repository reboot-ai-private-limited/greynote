import type { RoleName } from '@greynote/contracts';
import type { PlanKind } from './plan.js';

/**
 * `OPEN` until used, revoked or past `expiresAt`. `EXPIRED` is only written lazily (when a new
 * grant for the same Plan is made), so an `OPEN` row past `expiresAt` is expired too — read the
 * status through `effectiveGrantStatus`.
 */
export const GRANT_STATUSES = ['OPEN', 'USED', 'REVOKED', 'EXPIRED'] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

/**
 * A one-off exception to a Plan's submit deadline (decision-log 2026-09-28, sign-off B8): lets
 * `userId` submit one Plan — `kind` + `planKey` — after its deadline, once, before `expiresAt`.
 */
export interface LateSubmitGrant {
  id: string;
  userId: string;
  kind: PlanKind;
  /** `YYYY-MM-DD` for a Daily Plan, `YYYY-MM` for a Monthly Plan. */
  planKey: string;
  reason: string;
  grantedBy: string;
  grantedByRole: RoleName;
  grantedAt: Date;
  expiresAt: Date;
  status: GrantStatus;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

export const effectiveGrantStatus = (grant: LateSubmitGrant, now: Date): GrantStatus =>
  grant.status === 'OPEN' && grant.expiresAt <= now ? 'EXPIRED' : grant.status;
