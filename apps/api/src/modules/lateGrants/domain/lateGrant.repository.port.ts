import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LateGrant, LateGrantKind, LateGrantStatus, NewLateGrant } from './lateGrant.entity.js';

export interface LateGrantFilter {
  /** Only these employees' grants; absent = everyone. */
  userIds?: string[];
  kinds?: LateGrantKind[];
  /** `YYYY-MM`: grants whose period falls in this month (a daily plan's date counts by its month). */
  month?: string;
  status?: LateGrantStatus;
  /** The instant `status` is judged at: an `OPEN` grant past its end reads as `EXPIRED`. */
  now?: Date;
}

export interface LateGrantRepositoryPort {
  findById(id: string): Promise<LateGrant | null>;
  /** `OPEN` and not yet expired at `now`. */
  findUsable(userId: string, kind: LateGrantKind, periodKey: string, now: Date): Promise<LateGrant | null>;
  /** Closes an expired `OPEN` grant for the same period, then inserts. `null` if a usable one already exists. */
  create(input: NewLateGrant, now: Date): Promise<LateGrant | null>;
  /** Marks it used (inside the caller's transaction when given); false if it was used, revoked or expired meanwhile. */
  consume(id: string, now: Date, usedRef: string | null, ctx?: TransactionContext): Promise<boolean>;
  /** `null` if it was no longer usable. */
  revoke(id: string, revokedBy: string, now: Date): Promise<LateGrant | null>;
  /** Every grant of these kinds whose period starts with `periodPrefix` that is usable at `now`: a month table's "late allowed" marks. */
  listUsable(kinds: LateGrantKind[], periodPrefix: string, now: Date): Promise<LateGrant[]>;
  /** Ends every `OPEN` grant of this period (revoked by `system`); how many. Used when downstream money locks the period. */
  closeOpenForPeriod(userId: string, kinds: LateGrantKind[], periodPrefix: string, now: Date): Promise<number>;
  list(filter: LateGrantFilter, page: { page: number; pageSize: number }): Promise<{ items: LateGrant[]; total: number }>;
}
