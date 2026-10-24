import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import { monthRange } from '@/shared/time/businessTime.js';
import { shiftMonth } from '../../domain/tripExpansion.js';
import type { Actor } from '../planAccess.js';
import type { PlanDeadlines } from '../planDeadlines.js';

/**
 * Admin removes an employee's Monthly Plan for good — only for a month that hasn't started, whatever its status. Its approval
 * request and history go with it, and so do the Daily Plans written from it, unless one of them has been sent (waiting or approved):
 * then nothing is deleted. A trip that runs into the next month has to be shortened first, since the next month's plan holds part of it.
 */
export class DeleteMonthlyPlanUseCase {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly daily: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly deadlines: PlanDeadlines,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  async execute(actor: Actor, planId: string): Promise<void> {
    if (actor.role !== 'ADMIN') throw AppError.forbidden('Only Admin can delete a plan.');
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    const currentMonth = (await this.deadlines.today()).slice(0, 7);
    if (plan.planMonth <= currentMonth) throw AppError.conflict('That month has already started, so its plan can’t be deleted.');
    const next = shiftMonth(plan.planMonth, 1);
    if (plan.entries.some((e) => e.planDate.startsWith(`${next}-`))) {
      throw AppError.conflict(`A trip in this plan runs into ${next}. Shorten the trip first, then delete the plan.`);
    }

    const { from, to } = monthRange(plan.planMonth);
    const days = await this.daily.listForUser(plan.userId, from, to);
    const sent: string[] = [];
    for (const day of days) {
      const request = await this.approvals.getForRecord('DAILY_PLAN', day.id);
      if (request && !isEditableBySubmitter(request.status)) sent.push(day.planDate);
    }
    if (sent.length > 0) {
      throw AppError.conflict(`The daily plan for ${sent.join(', ')} was already sent, so the month can’t be deleted.`, { reason: 'PLAN_DAY_IN_USE', planDates: sent });
    }

    await this.transactions.run(async (ctx) => {
      for (const day of days) {
        await this.approvals.deleteForRecord('DAILY_PLAN', day.id, ctx);
        if (!(await this.daily.deleteById(day.id, day.revision, ctx))) throw AppError.conflict('A daily plan changed meanwhile. Try again.');
      }
      await this.approvals.deleteForRecord('MONTHLY_PLAN', plan.id, ctx);
      if (!(await this.plans.deleteById(plan.id, plan.revision, ctx))) throw AppError.conflict('This plan changed meanwhile. Reload it and try again.');
    });
  }
}
