import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import { isFieldDay, type PlannedDoctor } from '../../domain/plan.js';
import { assertEditable } from '../assertEditable.js';
import type { CarryOver } from '../carryOver.js';
import type { ManagerScope } from '../managerScope.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

/**
 * Set the doctors to call on the caller's plan for a day — also on a day inherited from the Monthly Plan, whose route stays
 * locked. Missed calls still owed from earlier days are added and can't be dropped. Editable only while the plan is.
 */
export class SetDailyPlanDoctorsUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly carryOver: CarryOver,
    private readonly views: PlanViews,
    private readonly scope: ManagerScope,
  ) {}

  async execute(userId: string, planDate: string, doctorIds: string[]): Promise<DailyPlanView> {
    const plan = await this.plans.findByUserAndDate(userId, planDate);
    if (!plan) throw AppError.notFound('Save the plan for this day first, then choose its doctors.');
    if (!isFieldDay(plan.workingType) && doctorIds.length > 0) {
      throw AppError.badRequest('Only a field work or doctor campaign day has doctors.', { field: 'doctorIds' });
    }
    await assertEditable(this.approvals, 'DAILY_PLAN', plan.id);
    const doctors: PlannedDoctor[] = isFieldDay(plan.workingType) ? await this.carryOver.compose(plan, doctorIds, await this.scope.doctorScope(userId, plan.workWith)) : [];
    const saved = await this.plans.saveDoctors(plan.id, plan.revision, doctors);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    return this.views.daily(saved);
  }
}
