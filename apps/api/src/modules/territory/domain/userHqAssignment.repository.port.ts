import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { UserHqAssignment } from './userHqAssignment.entity.js';

export interface UserHqAssignmentRepositoryPort {
  findActive(userId: string): Promise<UserHqAssignment | null>;
  /** The active rows of these users (at most one each), in one query. */
  findActiveForUsers(userIds: string[]): Promise<UserHqAssignment[]>;
  /** Everyone based in these HQs now: who "holds" a route since 2026-11-26. */
  listActiveInHqs(hqIds: string[]): Promise<UserHqAssignment[]>;
  /** Newest first, active and ended alike. */
  listForUser(userId: string): Promise<UserHqAssignment[]>;
  /** Ends the user's active row, if any. */
  endActive(userId: string, endedBy: string, ctx: TransactionContext): Promise<void>;
  /** `null` if another active row appeared meanwhile (the one-active-per-user index). */
  create(input: { userId: string; hqId: string; assignedBy: string }, ctx: TransactionContext): Promise<UserHqAssignment | null>;
}
