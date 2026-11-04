import type { RoleName } from '@greynote/contracts';

/** Everything with a deadline that Admin (or a manager, where allowed) can let one employee miss, once. */
export const LATE_GRANT_KINDS = [
  'DAILY_PLAN',
  'MONTHLY_PLAN',
  'EXPENSE_SUBMIT',
  'EXPENSE_APPROVE',
  'MONTHLY_STOCK',
  'SECONDARY_SALES',
  'DCR_SUBMIT',
] as const;
export type LateGrantKind = (typeof LATE_GRANT_KINDS)[number];

/** `OPEN` until used, revoked or past `expiresAt`. `EXPIRED` is written lazily, so read the status through `effectiveGrantStatus`. */
export const LATE_GRANT_STATUSES = ['OPEN', 'USED', 'REVOKED', 'EXPIRED'] as const;
export type LateGrantStatus = (typeof LATE_GRANT_STATUSES)[number];

export interface LateGrant {
  id: string;
  userId: string;
  kind: LateGrantKind;
  /** `YYYY-MM-DD` for `DAILY_PLAN` and `DCR_SUBMIT`, otherwise `YYYY-MM`. */
  periodKey: string;
  reason: string;
  grantedBy: string;
  grantedByRole: RoleName;
  grantedAt: Date;
  expiresAt: Date;
  status: LateGrantStatus;
  usedAt: Date | null;
  /** What the grant was spent on (a plan, expense month or statement id), when known. */
  usedRef: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

export type NewLateGrant = Omit<LateGrant, 'id' | 'status' | 'usedAt' | 'usedRef' | 'revokedAt' | 'revokedBy'>;

export const effectiveGrantStatus = (grant: LateGrant, now: Date): LateGrantStatus =>
  grant.status === 'OPEN' && grant.expiresAt <= now ? 'EXPIRED' : grant.status;
