import { randomBytes } from 'node:crypto';
import type { ApprovalStatus, ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { MonthlyPlan, MonthlyPlanPendingChange } from '../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import { applyDailySync, assertOnlyFutureChanged, changedDays, planDailySync } from './approvedMonthEdit.js';
import type { PreparedMonth } from './monthlyPlanWriter.js';
import type { PlanSubmitter } from './planSubmitter.js';

/**
 * A manager's change to an approved Tour Plan (decision-log 2026-11-19). Nothing of the plan changes when the manager sends it: the proposed month
 * waits on the plan as `pendingChange`, with an approval request of this kind for the manager above them (or Admin). Approving it applies it, by the same
 * rules an Admin's edit follows, checked again at that moment; rejecting or withdrawing it drops it. Admin and HR edit directly and skip all of this.
 */
export const MONTHLY_PLAN_CHANGE = 'MONTHLY_PLAN_CHANGE';

/** `<plan id>:<change id>`: a new request for every proposal, so a different manager can propose again after a rejection. */
export const changeRecordId = (planId: string, changeId: string): string => `${planId}:${changeId}`;
export const planIdOfChange = (recordId: string): string => recordId.split(':')[0] ?? recordId;

const APPLY: ReadonlySet<ApprovalStatus> = new Set(['MANAGER_APPROVED', 'APPROVED']);
const DROP: ReadonlySet<ApprovalStatus> = new Set(['REJECTED', 'WITHDRAWN', 'REOPENED']);

/** The same refusal the approver sees, with what to do about it: nothing was written. */
function stale(err: unknown): never {
  if (err instanceof AppError && err.statusCode === 409) {
    throw AppError.conflict(`${err.message} This change can’t be approved as it stands. Reject it and ask the manager to send it again.`, err.publicDetails ?? err.details);
  }
  throw err;
}

/** A manager sends a change to an approved month: checked now, kept on the plan, and put in front of the next manager up. */
export class ProposeMonthlyChange {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly submitter: PlanSubmitter,
    private readonly daily: DailyPlanRepositoryPort,
    private readonly deadlines: { today(): Promise<string> },
    private readonly transactions: TransactionRunnerPort,
    private readonly now: () => Date,
  ) {}

  async execute(actorId: string, plan: MonthlyPlan, prepared: PreparedMonth, reason: string): Promise<MonthlyPlan> {
    if (plan.pendingChange) {
      throw AppError.conflict('A change to this plan is already waiting for approval. It has to be decided or withdrawn before another can be sent.', { reason: 'PLAN_CHANGE_PENDING' });
    }
    if (prepared.next) {
      throw AppError.conflict(`A trip that runs into ${prepared.next.month} can’t be changed from here. Ask Admin to change it.`, { reason: 'PLAN_CHANGE_NEXT_MONTH' });
    }
    assertOnlyFutureChanged(plan.entries, prepared.entries, await this.deadlines.today());
    const changes = changedDays(plan.entries, prepared.entries);
    if (changes.length === 0) throw AppError.badRequest('Nothing was changed.', { field: 'entries' });
    // Refused now if a changed day is already worked or sent; checked again when it is approved.
    await planDailySync(plan.userId, changes, this.daily, this.approvals);
    await this.submitter.validateDays(plan.userId, prepared.entries.filter((d) => changes.some((c) => c.date === d.planDate)).map((day, i) => ({ day, field: `entries.${i}.` })));

    const pending: MonthlyPlanPendingChange = { id: randomBytes(6).toString('hex'), by: actorId, at: this.now(), reason, baseRevision: plan.revision, entries: prepared.entries };
    await this.transactions.run(async (ctx) => {
      if (!(await this.plans.setPendingChange(plan.id, pending, ctx))) {
        throw AppError.conflict('A change to this plan is already waiting for approval.', { reason: 'PLAN_CHANGE_PENDING' });
      }
      await this.approvals.submit({ kind: MONTHLY_PLAN_CHANGE, recordId: changeRecordId(plan.id, pending.id), submitterId: actorId }, ctx);
    });
    return { ...plan, pendingChange: pending };
  }
}

/**
 * The `MONTHLY_PLAN_CHANGE` kind's `onStatusChange`, inside the approval's transaction. Approved: the month is replaced (the old days kept in `amendments`), the
 * employee's untouched Daily Plans follow, and the waiting change is cleared. Rejected, withdrawn or reopened: it is just cleared. Throwing (a day is now past or
 * sent, or the month was changed by someone else since) rolls the approval back, so nothing half-happens.
 */
export function makeMonthlyPlanChangeHandler(
  plans: MonthlyPlanRepositoryPort,
  daily: DailyPlanRepositoryPort,
  approvals: ApprovalsPort,
  deadlines: { today(): Promise<string> },
  now: () => Date,
): (change: ApprovalStatusChange, ctx: TransactionContext) => Promise<void> {
  return async (change, ctx) => {
    const plan = await plans.findById(planIdOfChange(change.recordId));
    const pending = plan?.pendingChange;
    if (!plan || !pending || changeRecordId(plan.id, pending.id) !== change.recordId) return;
    if (DROP.has(change.status)) {
      await plans.clearPendingChange(plan.id, ctx);
      return;
    }
    if (!APPLY.has(change.status)) return;

    if (plan.revision !== pending.baseRevision) {
      throw AppError.conflict('This plan was changed by someone else after this change was sent. Reject it and ask the manager to send it again.', { reason: 'PLAN_CHANGED_SINCE' });
    }
    try {
      assertOnlyFutureChanged(plan.entries, pending.entries, await deadlines.today());
      const sync = await planDailySync(plan.userId, changedDays(plan.entries, pending.entries), daily, approvals);
      const saved = await plans.amend(plan.id, plan.revision, pending.entries, { by: pending.by, at: now(), reason: pending.reason, previous: plan.entries }, ctx);
      if (!saved) throw AppError.conflict('This plan changed while the change was being approved. Reload it and try again.');
      await applyDailySync(plan.userId, sync, daily, ctx);
    } catch (err) {
      stale(err);
    }
    await plans.clearPendingChange(plan.id, ctx);
  };
}
