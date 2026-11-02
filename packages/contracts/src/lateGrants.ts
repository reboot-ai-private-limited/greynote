export const LATE_GRANT_KINDS = ['DAILY_PLAN', 'MONTHLY_PLAN', 'EXPENSE_SUBMIT', 'EXPENSE_APPROVE', 'MONTHLY_STOCK', 'SECONDARY_SALES'] as const;
export type LateGrantKindDto = (typeof LATE_GRANT_KINDS)[number];
export type LateGrantStatusDto = 'OPEN' | 'USED' | 'REVOKED' | 'EXPIRED';

/** `GET /late-grants`: a one-off exception that lets one employee do one late thing for one period. */
export interface LateGrantDto {
  id: string;
  userId: string;
  kind: LateGrantKindDto;
  /** `YYYY-MM-DD` for a daily plan, otherwise `YYYY-MM`. */
  periodKey: string;
  reason: string;
  grantedBy: string;
  grantedByRole: string;
  grantedAt: string;
  expiresAt: string;
  status: LateGrantStatusDto;
  usedAt: string | null;
  usedRef: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

/** `POST /late-grants`. `expiresAt` (ISO date-time) is when the exception ends; left out, the kind's default length applies. */
export interface GrantLateDto {
  userId: string;
  kind: LateGrantKindDto;
  periodKey: string;
  reason: string;
  expiresAt?: string;
}

/** `GET /late-grants/kinds`: what the grant form offers. */
export interface LateGrantKindInfoDto {
  kind: LateGrantKindDto;
  label: string;
  group: 'Plans' | 'Expenses' | 'Sales';
  period: 'DAY' | 'MONTH';
}

/** `GET /late-grants/preview`: whether a grant can be made for this employee and period, and why not. */
export interface LateGrantPreviewDto {
  /** Null when the period is open for a late entry. */
  lockedReason: string | null;
}
