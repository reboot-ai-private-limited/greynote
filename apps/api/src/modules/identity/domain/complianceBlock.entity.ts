/**
 * One document per block event — kept as its own collection (not an embedded array on `User`)
 * since it grows independently over an employee's whole tenure. Retention is indefinite by
 * design (see `docs/decision-log.md`) — no TTL. `User.isBlocked` stays a fast top-level flag;
 * this is the historical detail.
 */
export interface ComplianceBlockEvent {
  id: string;
  userId: string;
  reason: string;
  blockedAt: Date;
  /** An Admin, or a manager above the employee (decision-log 2026-10-12). `null` while still open. */
  unblockedBy: string | null;
  /** `null` = still open (the user is currently blocked because of this event). */
  unblockedAt: Date | null;
  /** Who cleared it: Admin, or a manager above the employee. `null` while open. */
  unblockedByRole: string | null;
  /** Why they cleared it — required, and kept for audit. `null` while open. */
  unblockReason: string | null;
}
