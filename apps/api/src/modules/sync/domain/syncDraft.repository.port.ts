import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SyncDraft } from './syncDraft.entity.js';

export interface SyncDraftRepositoryPort {
  /**
   * Stores the draft only if it is newer than the one held for `(userId, clientId)` — or there is none —
   * as one atomic step, so simultaneous uploads from two phones leave the newest, never a race's
   * winner. `false` when an equal-or-newer copy is already held. `expiresAt` is when it may be purged.
   */
  putIfNewer(draft: SyncDraft, expiresAt: Date): Promise<boolean>;
  /** Which of these client ids the user already holds a draft (or tombstone) for. */
  findExistingIds(userId: string, clientIds: string[]): Promise<Set<string>>;
  /** How many live drafts (not removals) the user holds. */
  countLive(userId: string): Promise<number>;
  /** The user's live drafts oldest-id first, after `afterId`; `limit + 1` rows so the caller can tell if more remain. */
  listLive(userId: string, afterId: string | null, limit: number): Promise<Array<SyncDraft & { id: string }>>;
  /** Removes the record's draft (and any tombstone) — inside the transaction that commits the record. */
  deleteForRecord(userId: string, clientId: string, ctx: TransactionContext): Promise<void>;
}
