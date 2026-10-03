import { isEditableBySubmitter, type ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { MonthlyPlan } from '../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import type { PlanDay } from '../domain/plan.js';
import type { PlanDeadlines } from './planDeadlines.js';

const sameDay = (a: PlanDay, b: PlanDay): boolean =>
  a.workingType === b.workingType &&
  a.remarks === b.remarks &&
  [...a.routeIds].sort().join() === [...b.routeIds].sort().join() &&
  [...a.workWith].sort().join() === [...b.workWith].sort().join();

/**
 * The `MONTHLY_PLAN` kind's `onStatusChange`, run inside the approval module's transaction: once the month is past the manager
 * (`MANAGER_APPROVED`, or `APPROVED` straight away for a manager-only workflow or an Admin override), every entry from today
 * on becomes that day's Daily Plan, `source: MONTHLY`, as a draft. Inheriting never approves anything — the employee still
 * submits each day and the manager still approves it — and the employee can't edit it, only a manager or Admin can amend.
 *
 * Safe to run again (`MANAGER_APPROVED` then `APPROVED`, or a reopened and re-approved month):
 * - no plan for the day yet: created;
 * - an inherited plan that hasn't been submitted (or came back for changes): brought in line with the entry;
 * - a day that was submitted, approved, written by the employee, or amended by a manager: left alone.
 * Past days are skipped: nothing can be logged against them any more.
 */
export async function inheritDays(
  plan: MonthlyPlan,
  daily: DailyPlanRepositoryPort,
  approvals: ApprovalsPort,
  today: string,
  ctx: TransactionContext,
): Promise<number> {
  let written = 0;
  for (const { planDate, ...entry } of plan.entries) {
    if (planDate < today) continue;
    if (await daily.createInherited(plan.userId, planDate, entry, ctx)) {
      written++;
      continue;
    }
    const existing = await daily.findByUserAndDate(plan.userId, planDate);
    if (!existing || existing.source !== 'MONTHLY' || existing.amendments.length > 0 || sameDay(existing, entry)) continue;
    const request = await approvals.getForRecord('DAILY_PLAN', existing.id);
    if (request && !isEditableBySubmitter(request.status)) continue;
    if (await daily.applyChange(existing.id, existing.revision, entry, ctx)) written++;
  }
  return written;
}

export function makeMonthlyPlanInheritHandler(
  monthly: MonthlyPlanRepositoryPort,
  daily: DailyPlanRepositoryPort,
  approvals: ApprovalsPort,
  deadlines: PlanDeadlines,
) {
  return async (change: ApprovalStatusChange, ctx: TransactionContext): Promise<void> => {
    if (change.status !== 'MANAGER_APPROVED' && change.status !== 'APPROVED') return;
    const plan = await monthly.findById(change.recordId);
    if (!plan) throw AppError.internal('INTERNAL', { reason: 'MONTHLY_PLAN_NOT_FOUND', recordId: change.recordId });
    await inheritDays(plan, daily, approvals, await deadlines.today(), ctx);
  };
}
