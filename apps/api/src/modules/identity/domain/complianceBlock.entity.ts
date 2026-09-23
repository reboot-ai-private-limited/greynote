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
  /** Must resolve to an ADMIN-role user — never the target's manager. `null` while still open. */
  unblockedBy: string | null;
  /** `null` = still open (the user is currently blocked because of this event). */
  unblockedAt: Date | null;
}
