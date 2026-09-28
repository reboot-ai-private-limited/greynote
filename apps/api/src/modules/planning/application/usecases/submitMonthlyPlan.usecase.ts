import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { PlanDeadlines } from '../planDeadlines.js';
import type { PlanSubmitter } from '../planSubmitter.js';

/** Submit — or resubmit — the caller's whole month as one unit. Needs a live connection (LLD). */
export class SubmitMonthlyPlanUseCase {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly deadlines: PlanDeadlines,
    private readonly submitter: PlanSubmitter,
  ) {}

  async execute(userId: string, planId: string): Promise<ApprovalRequest> {
    const plan = await this.plans.findById(planId);
    if (!plan || plan.userId !== userId) throw AppError.notFound('No such plan.');
    if (plan.entries.length === 0) throw AppError.badRequest('Plan at least one day first.', { field: 'entries' });

    return this.submitter.submit({
      kind: 'MONTHLY_PLAN',
      recordId: plan.id,
      ownerId: plan.userId,
      planKey: plan.planMonth,
      deadline: await this.deadlines.monthly(plan.planMonth),
      days: plan.entries.map((day, i) => ({ day, field: `entries.${i}.` })),
      confirmRevision: (ctx) => this.plans.confirmRevision(plan.id, plan.revision, ctx),
    });
  }
}
