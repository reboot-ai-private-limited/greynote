import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LeaveApprovalGrant } from './leaveApprovalGrant.entity.js';

export interface LeaveApprovalGrantRepositoryPort {
  /** The usable grant for this leave: `OPEN` and not yet expired at `now`. */
  findUsable(leaveId: string, now: Date): Promise<LeaveApprovalGrant | null>;
  /** Closes an expired `OPEN` grant for the same leave, then inserts. `null` if a usable one already exists. */
  create(input: Omit<LeaveApprovalGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date): Promise<LeaveApprovalGrant | null>;
  /** Inside the approval transaction; false if it was used, revoked or expired meanwhile. */
  consume(id: string, now: Date, ctx: TransactionContext): Promise<boolean>;
  /** Revokes the leave's usable grant; `null` if there is none. */
  revokeForLeave(leaveId: string, revokedBy: string, now: Date): Promise<LeaveApprovalGrant | null>;
}
