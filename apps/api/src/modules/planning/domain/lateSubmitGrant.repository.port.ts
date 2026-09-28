import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LateSubmitGrant } from './lateSubmitGrant.entity.js';
import type { PlanKind } from './plan.js';

export interface LateSubmitGrantFilter {
  /** Only these employees' grants; absent = everyone. */
  userIds?: string[];
  kind?: PlanKind;
}

export interface LateSubmitGrantRepositoryPort {
  findById(id: string): Promise<LateSubmitGrant | null>;
  /** The usable grant for this Plan: `OPEN` and not yet expired at `now`. */
  findUsable(userId: string, kind: PlanKind, planKey: string, now: Date): Promise<LateSubmitGrant | null>;
  /**
   * Closes any expired `OPEN` grant for the same Plan, then inserts. `null` if a usable one
   * already exists — at most one open grant per Plan.
   */
  create(
    input: Omit<LateSubmitGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>,
    now: Date,
  ): Promise<LateSubmitGrant | null>;
  /** Inside the submit transaction; false if it was used, revoked or expired meanwhile. */
  consume(id: string, now: Date, ctx: TransactionContext): Promise<boolean>;
  /** `null` if it was no longer usable. */
  revoke(id: string, revokedBy: string, now: Date): Promise<LateSubmitGrant | null>;
  /** Newest first. */
  list(filter: LateSubmitGrantFilter, page: { page: number; pageSize: number }): Promise<{ items: LateSubmitGrant[]; total: number }>;
}
