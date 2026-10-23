import { AppError } from '@/shared/errors/AppError.js';
import { appEvents } from '@/shared/events/appEvents.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { MonthlyPlanWriter } from '../monthlyPlanWriter.js';
import type { OffDays } from '../offDays.js';
import type { Actor } from '../planAccess.js';
import type { PlanSubmitter } from '../planSubmitter.js';
import type { MonthlyPlanView, PlanViews } from '../planViews.js';

/**
 * A manager or Admin changes an employee's Monthly Plan for them while it waits for the manager's decision — the whole month as
 * it should be, with a reason. Allowed for Admin and for anyone above the employee in the chain; never for the employee, and never
 * on their own plan. A draft or rejected plan is the employee's to edit, and one the manager has approved is frozen (Admin reopens it).
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
  ) {
    this.writer = new MonthlyPlanWriter(plans, approvals, offDays);
  }

  async execute(actor: Actor, planId: string, entries: MonthlyPlanEntry[], reason: string): Promise<MonthlyPlanView> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    if (actor.id === plan.userId) throw AppError.forbidden('You can’t amend your own plan. Ask your manager.');
    if (actor.role !== 'ADMIN') {
      const chain = await this.users.getManagerChain(plan.userId);
      if (!chain.some((m) => m.id === actor.id)) throw AppError.notFound('No such plan.');
    }

    const prepared = await this.writer.prepare(plan.userId, plan.planMonth, entries, async () => {
      const status = (await this.approvals.getForRecord('MONTHLY_PLAN', plan.id))?.status;
      if (status === 'MANAGER_APPROVED' || status === 'APPROVED') {
        throw AppError.conflict('This plan is already approved and can’t be amended. Ask Admin to reopen it.');
      }
      if (status !== 'SUBMITTED') {
        throw AppError.conflict(
          status === undefined ? 'This plan hasn’t been sent yet; the employee can still edit it.' : 'This plan isn’t waiting for approval; the employee can edit it.',
        );
      }
    });
    await this.submitter.validateDays(plan.userId, prepared.entries.map((day, i) => ({ day, field: `entries.${i}.` })));

    const saved = await this.plans.amend(plan.id, plan.revision, prepared.entries, {
      by: actor.id,
      at: this.now(),
      reason,
      previous: plan.entries,
    });
    if (!saved) throw AppError.conflict('This plan changed while you were amending it. Reload it and try again.');
    await this.writer.saveNext(plan.userId, prepared);

    const byName = (await this.users.getUserSummaries([actor.id]))[0]?.name ?? 'Your manager';
    appEvents.emit('monthly.plan.amended', { userId: plan.userId, planId: plan.id, planMonth: plan.planMonth, by: actor.id, byName, reason });
    return this.views.monthly(saved);
  }
}
