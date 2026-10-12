import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { CarryOver } from '../carryOver.js';
import { assertMonthlyApproved, type MonthlyApprovedCheck } from '../monthlyGate.js';
import type { PlanDeadlines } from '../planDeadlines.js';
import type { PlanSubmitter } from '../planSubmitter.js';

/** Submit — or resubmit — the caller's own Daily Plan. Needs a live connection (LLD). */
export class SubmitDailyPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly deadlines: PlanDeadlines,
    private readonly submitter: PlanSubmitter,
    private readonly approvals: ApprovalsPort,
    private readonly carryOver: CarryOver,
    private readonly monthlyApproved: MonthlyApprovedCheck,
  ) {}

  async execute(userId: string, planId: string): Promise<ApprovalRequest> {
    const found = await this.plans.findById(planId);
    // Someone else's plan is "not found" — the owner is the only one who can submit it.
    if (!found || found.userId !== userId) throw AppError.notFound('No such plan.');
    await assertMonthlyApproved(this.monthlyApproved, userId, found.planDate);
    let plan = found;

    // The list sent for approval is the whole list: the MR's picks plus every missed call still owed. Only a plan that can still
    // be edited is touched; one already waiting or approved is refused by the submitter below.
    const request = await this.approvals.getForRecord('DAILY_PLAN', plan.id);
    if (plan.workingType === 'FIELD_WORK' && (!request || isEditableBySubmitter(request.status))) {
      const doctors = await this.carryOver.compose(plan, plan.doctors.filter((d) => d.carriedFrom === null).map((d) => d.doctorId));
      const changed = doctors.length !== plan.doctors.length || doctors.some((d, i) => d.doctorId !== plan.doctors[i]?.doctorId || d.carriedFrom !== plan.doctors[i]?.carriedFrom);
      if (changed) {
        const saved = await this.plans.saveDoctors(plan.id, plan.revision, doctors);
        if (!saved) throw AppError.conflict('This plan changed while it was being submitted. Reload it and try again.');
        plan = saved;
      }
    }

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
