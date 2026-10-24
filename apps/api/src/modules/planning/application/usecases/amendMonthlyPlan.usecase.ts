import { AppError } from '@/shared/errors/AppError.js';
import { appEvents } from '@/shared/events/appEvents.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { applyDailySync, assertOnlyFutureChanged, changedDays, planDailySync, type DailySync } from '../approvedMonthEdit.js';
import { MonthlyPlanWriter } from '../monthlyPlanWriter.js';
import type { OffDays } from '../offDays.js';
import type { Actor } from '../planAccess.js';
import type { PlanDeadlines } from '../planDeadlines.js';
import type { PlanSubmitter } from '../planSubmitter.js';
import type { MonthlyPlanView, PlanViews } from '../planViews.js';

/**
 * A manager or Admin changes an employee's Monthly Plan for them while it waits for the manager's decision — the whole month as
 * it should be, with a reason. Allowed for Admin and for anyone above the employee in the chain; never for the employee, and never
 * on their own plan. A draft or rejected plan is the employee's to edit, and one the manager has approved is frozen (Admin reopens it).
 *
 * HR and Admin may also change a month that is already past its manager or fully approved, for days after today only (see
 * `approvedMonthEdit`): the approval stays as it is, and the Daily Plans written from the month follow the change — unless the
 * employee has changed or sent one of those days, which refuses the edit. The reason is optional.
 *
 * The days are checked like the employee's own save and submit — off days, trips, and the employee's own active routes and
 * colleagues. The approval is untouched: the plan keeps waiting and the manager decides it as usual (the amender's authority is
 * the approval). The previous days are kept on the plan and the employee is told.
 */
export class AmendMonthlyPlanUseCase {
  private readonly writer: MonthlyPlanWriter;

  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly submitter: PlanSubmitter,
    private readonly views: PlanViews,
    offDays: OffDays,
    private readonly now: () => Date,
    /** What editing an approved month needs; without it, an approved month stays frozen. */
    private readonly approvedEdit?: { deadlines: PlanDeadlines; daily: DailyPlanRepositoryPort; transactions: TransactionRunnerPort },
  ) {
    this.writer = new MonthlyPlanWriter(plans, approvals, offDays);
  }

  async execute(actor: Actor, planId: string, entries: MonthlyPlanEntry[], reason: string): Promise<MonthlyPlanView> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    if (actor.id === plan.userId) throw AppError.forbidden('You can’t amend your own plan. Ask your manager.');
    const privileged = actor.role === 'ADMIN' || actor.role === 'HR';
    if (!privileged) {
      const chain = await this.users.getManagerChain(plan.userId);
      if (!chain.some((m) => m.id === actor.id)) throw AppError.notFound('No such plan.');
    }

    let afterApproval = false as boolean;
    const prepared = await this.writer.prepare(plan.userId, plan.planMonth, entries, async () => {
      const status = (await this.approvals.getForRecord('MONTHLY_PLAN', plan.id))?.status;
      if (status === 'MANAGER_APPROVED' || status === 'APPROVED') {
        if (!privileged || !this.approvedEdit) {
          throw AppError.conflict('This plan is already approved and can’t be amended. Ask Admin to reopen it.');
        }
        afterApproval = true;
        return;
      }
      if (status !== 'SUBMITTED') {
        throw AppError.conflict(
          status === undefined ? 'This plan hasn’t been sent yet; the employee can still edit it.' : 'This plan isn’t waiting for approval; the employee can edit it.',
        );
      }
    });

    const changes = changedDays(plan.entries, prepared.entries);
    let sync: DailySync | null = null;
    if (afterApproval && this.approvedEdit) {
      assertOnlyFutureChanged(plan.entries, prepared.entries, await this.approvedEdit.deadlines.today());
      sync = await planDailySync(plan.userId, changes, this.approvedEdit.daily, this.approvals);
    }
    // An approved month only has its changed days checked: the rest were accepted when it was approved.
    const checked = prepared.entries.map((day, i) => ({ day, field: `entries.${i}.` })).filter(({ day }) => !afterApproval || changes.some((c) => c.date === day.planDate));
    await this.submitter.validateDays(plan.userId, checked);

    const amendment = { by: actor.id, at: this.now(), reason, previous: plan.entries };
    let saved;
    if (sync && this.approvedEdit) {
      const pending = sync;
      const { daily } = this.approvedEdit;
      saved = await this.approvedEdit.transactions.run(async (ctx) => {
        const result = await this.plans.amend(plan.id, plan.revision, prepared.entries, amendment, ctx);
        if (result) await applyDailySync(plan.userId, pending, daily, ctx);
        return result;
      });
    } else {
      saved = await this.plans.amend(plan.id, plan.revision, prepared.entries, amendment);
    }
    if (!saved) throw AppError.conflict('This plan changed while you were amending it. Reload it and try again.');
    await this.writer.saveNext(plan.userId, prepared);

    const byName = (await this.users.getUserSummaries([actor.id]))[0]?.name ?? 'Your manager';
    appEvents.emit('monthly.plan.amended', { userId: plan.userId, planId: plan.id, planMonth: plan.planMonth, by: actor.id, byName, reason });
    return this.views.monthly(saved);
  }
}
