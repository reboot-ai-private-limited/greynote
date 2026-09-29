/**
 * Proof that a record reached the server: unique on `(userId, clientId)`, written in the same
 * transaction as the record it stands for. Sending the record again finds this and does nothing.
 * Only records that were applied get one — a failed record is applied fresh when it's fixed and sent again.
 */
export interface SyncReceipt {
  userId: string;
  clientId: string;
  kind: string;
  serverId: string;
  /** What the handler returned for the phone; replayed on a retry. */
  data?: unknown;
  syncedAt: Date;
}
