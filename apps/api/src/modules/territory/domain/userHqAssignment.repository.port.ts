import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { UserHqAssignment } from './userHqAssignment.entity.js';

export interface UserHqAssignmentRepositoryPort {
  findActive(userId: string): Promise<UserHqAssignment | null>;
  /** Newest first, active and ended alike. */
  listForUser(userId: string): Promise<UserHqAssignment[]>;
  /** Ends the user's active row, if any. */
  endActive(userId: string, endedBy: string, ctx: TransactionContext): Promise<void>;
  /** `null` if another active row appeared meanwhile (the one-active-per-user index). */
  create(input: { userId: string; hqId: string; assignedBy: string }, ctx: TransactionContext): Promise<UserHqAssignment | null>;
}
