export const LEAVE_GRANT_STATUSES = ['OPEN', 'USED', 'REVOKED', 'EXPIRED'] as const;
export type LeaveGrantStatus = (typeof LEAVE_GRANT_STATUSES)[number];

/**
 * A one-off exception that lets one leave be approved after its first day has passed (decision-log 2026-10-12, like the late Plan
 * exception of sign-off B8). Admin only. Usable once, before `expiresAt`.
 */
export interface LeaveApprovalGrant {
  id: string;
  leaveId: string;
  userId: string;
  reason: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt: Date;
  status: LeaveGrantStatus;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}
