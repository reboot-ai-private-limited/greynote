import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { PlanDeadlines } from '../planDeadlines.js';
import type { PlanSubmitter } from '../planSubmitter.js';

/** Submit — or resubmit — the caller's own Daily Plan. Needs a live connection (LLD). */
export class SubmitDailyPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly deadlines: PlanDeadlines,
    private readonly submitter: PlanSubmitter,
  ) {}

  async execute(userId: string, planId: string): Promise<ApprovalRequest> {
    const plan = await this.plans.findById(planId);
    // Someone else's plan is "not found" — the owner is the only one who can submit it.
    if (!plan || plan.userId !== userId) throw AppError.notFound('No such plan.');

    return this.submitter.submit({
      kind: 'DAILY_PLAN',
      recordId: plan.id,
      ownerId: plan.userId,
      planKey: plan.planDate,
      deadline: await this.deadlines.daily(plan.planDate),
      resubmitPolicy: await this.deadlines.dailyResubmitPolicy(plan.planDate),
      lateResubmits: plan.lateResubmits,
      days: [{ day: plan, field: '' }],
      confirmRevision: (count, ctx) => this.plans.confirmRevision(plan.id, plan.revision, count, ctx),
    });
  }
}
