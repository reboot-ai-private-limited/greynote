import type { ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { LeaveApprovalCutoff } from './leaveApprovalCutoff.js';
import type { LeaveLock } from './leaveLock.js';
import type { LeaveBalanceRepositoryPort } from '../domain/leaveBalance.repository.port.js';
import type { LeaveRepositoryPort } from '../domain/leave.repository.port.js';

/**
 * The `LEAVE` kind's `onStatusChange`: moves a paid leave's days through the balance ledger
 * (LLD hr.md), inside the approval module's transaction — if it throws, the decision rolls back.
 * Submits and resubmits reserve in HR's own transaction, so they don't pass through here.
 */
export function makeLeaveLedger(leaves: LeaveRepositoryPort, balances: LeaveBalanceRepositoryPort, lock: LeaveLock, cutoff: LeaveApprovalCutoff) {
  return async (change: ApprovalStatusChange, ctx: TransactionContext): Promise<void> => {
    const leave = await leaves.findById(change.recordId);
    if (!leave) throw AppError.internal('INTERNAL', { reason: 'LEAVE_NOT_FOUND', recordId: change.recordId });
    // Approving a leave, or reopening an approved one, changes the days that count: not in a month whose salary is finalized.
    // Rejecting or withdrawing one that was never approved changes nothing for payroll, so those stay allowed.
    if (change.status === 'APPROVED' || change.status === 'REOPENED') await lock.assertUnlocked(leave.userId, leave.days.map((d) => d.date));
    // The cutoff is the leave's first day: past it only an Admin exception lets an approval through (manager or final, even Admin's own).
    if (change.status === 'MANAGER_APPROVED' || change.status === 'APPROVED') await cutoff.assertMayApprove(leave, ctx);
    // `ledgerDays` is what actually moved the balance: less than the leave's days for a probation leave that outran its balance.
    if (!leave.isPaid || leave.ledgerDays === 0) return;

    const key = { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year: leave.year };
    switch (change.status) {
      case 'APPROVED':
        return balances.consume(key, leave.ledgerDays, ctx);
      case 'REJECTED':
      case 'WITHDRAWN':
        return balances.release(key, leave.ledgerDays, ctx);
      case 'REOPENED':
        return balances.giveBack(key, leave.ledgerDays, ctx);
      default:
        return; // MANAGER_APPROVED: still pending.
    }
  };
}
