import type { ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { LeaveBalanceRepositoryPort } from '../domain/leaveBalance.repository.port.js';
import type { LeaveRepositoryPort } from '../domain/leave.repository.port.js';

/**
 * The `LEAVE` kind's `onStatusChange`: moves a paid leave's days through the balance ledger
 * (LLD hr.md), inside the approval module's transaction — if it throws, the decision rolls back.
 * Submits and resubmits reserve in HR's own transaction, so they don't pass through here.
 */
export function makeLeaveLedger(leaves: LeaveRepositoryPort, balances: LeaveBalanceRepositoryPort) {
  return async (change: ApprovalStatusChange, ctx: TransactionContext): Promise<void> => {
    const leave = await leaves.findById(change.recordId);
    if (!leave) throw AppError.internal('INTERNAL', { reason: 'LEAVE_NOT_FOUND', recordId: change.recordId });
    if (!leave.isPaid) return;

    const key = { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year: leave.year };
    switch (change.status) {
      case 'APPROVED':
        return balances.consume(key, leave.daysCount, ctx);
      case 'REJECTED':
      case 'WITHDRAWN':
        return balances.release(key, leave.daysCount, ctx);
      case 'REOPENED':
        return balances.giveBack(key, leave.daysCount, ctx);
      default:
        return; // MANAGER_APPROVED: still pending.
    }
  };
}
