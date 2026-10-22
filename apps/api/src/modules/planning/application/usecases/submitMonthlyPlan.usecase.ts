import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import { assertNoOffDays, lastDayOf } from '../../domain/offDays.js';
import { monthRange } from '@/shared/time/businessTime.js';
import { OffDays } from '../offDays.js';
import type { PlanDeadlines } from '../planDeadlines.js';
import type { PlanSubmitter } from '../planSubmitter.js';

/**
 * Submit — or resubmit — the caller's whole month as one unit. Needs a live connection (LLD). The off days are checked again, as
 * they stand now: a holiday HR added after the plan was saved has to be taken out of it before it can go.
 */
export class SubmitMonthlyPlanUseCase {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly deadlines: PlanDeadlines,
    private readonly submitter: PlanSubmitter,
    private readonly offDays: OffDays = new OffDays(),
  ) {}

  async execute(userId: string, planId: string): Promise<ApprovalRequest> {
    const plan = await this.plans.findById(planId);
    if (!plan || plan.userId !== userId) throw AppError.notFound('No such plan.');
    if (plan.entries.length === 0) throw AppError.badRequest('Plan at least one day first.', { field: 'entries' });
    const range = monthRange(plan.planMonth);
    assertNoOffDays(plan.entries, await this.offDays.byDate(userId, range.from, lastDayOf(plan.entries, range.to)));

    return this.submitter.submit({
      kind: 'MONTHLY_PLAN',
      recordId: plan.id,
      ownerId: plan.userId,
      planKey: plan.planMonth,
      deadline: await this.deadlines.monthly(plan.planMonth),
      resubmitPolicy: await this.deadlines.monthlyResubmitPolicy(plan.planMonth),
      lateResubmits: plan.lateResubmits,
      days: plan.entries.map((day, i) => ({ day, field: `entries.${i}.` })),
      confirmRevision: (count, ctx) => this.plans.confirmRevision(plan.id, plan.revision, count, ctx),
    });
  }
}
