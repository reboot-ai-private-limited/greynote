import type { ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { DailyPlanChangeRepositoryPort } from '../domain/dailyPlanChange.repository.port.js';
import type { PlanDeadlines } from './planDeadlines.js';

/** The base Plan counts as approved while its gate is open (LLD planning.md). */
export const isPlanApproved = (status: string | undefined): boolean => status === 'MANAGER_APPROVED' || status === 'APPROVED';

/**
 * The `DAILY_PLAN_CHANGE` kind's `onStatusChange`, run inside the approval module's transaction —
 * if it throws, the decision rolls back and the approver sees why (LLD planning.md, In-day changes):
 *
 * - `APPROVED` — the proposed day replaces the plan's body. Refused (409) if the plan is no longer
 *   approved, has been changed since the request was made, or the day is over: a plan for a day
 *   that has passed is history the field activity was logged against.
 * - `REJECTED` / `WITHDRAWN` — the change is closed; the plan is untouched and stays approved.
 * - `REOPENED` — refused. Reopening a decided change would mean undoing an edit already made to the
 *   plan; Admin reopens the plan itself instead.
 */
export function makeDailyPlanChangeHandler(
  changes: DailyPlanChangeRepositoryPort,
  plans: DailyPlanRepositoryPort,
  approvals: ApprovalsPort,
  deadlines: PlanDeadlines,
) {
  return async (change: ApprovalStatusChange, ctx: TransactionContext): Promise<void> => {
    if (change.status === 'REOPENED') {
      throw AppError.conflict('A decided change can’t be reopened. Reopen the plan itself instead.');
    }
    if (change.status !== 'APPROVED' && change.status !== 'REJECTED' && change.status !== 'WITHDRAWN') return;

    const record = await changes.findById(change.recordId);
    if (!record) throw AppError.internal('INTERNAL', { reason: 'PLAN_CHANGE_NOT_FOUND', recordId: change.recordId });
    if (change.status !== 'APPROVED') return changes.close(record.id, false, ctx);

    const plan = await plans.findById(record.planId);
    if (!plan) throw AppError.internal('INTERNAL', { reason: 'PLAN_NOT_FOUND', recordId: record.planId });
    if (record.planDate < (await deadlines.today())) {
      throw AppError.conflict('That day is over, so its plan can no longer be changed. Reject this change.');
    }
    const base = await approvals.getForRecord('DAILY_PLAN', plan.id);
    if (!isPlanApproved(base?.status)) {
      throw AppError.conflict('The plan is no longer approved, so this change can’t be applied. Reject it.');
    }
    if (!(await plans.applyChange(plan.id, record.basedOnRevision, record.proposed, ctx))) {
      throw AppError.conflict('The plan was changed after this was requested, so it can’t be applied. Reject it.');
    }
    await changes.close(record.id, true, ctx);
  };
}
