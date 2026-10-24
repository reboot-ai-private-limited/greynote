import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { PlanDay } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ManagerScope } from '../managerScope.js';
import type { Actor } from '../planAccess.js';
import type { PlanDeadlines } from '../planDeadlines.js';
import type { PlanSubmitter } from '../planSubmitter.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

/** Whether the employee has already reported the day (a DCR submitted), so its TA/DA no longer follows the plan. */
export type DayReportedCheck = (userId: string, planDate: string) => Promise<boolean>;

/**
 * A manager, HR or Admin changes an employee's Daily Plan for them — the way a day differs from the monthly plan, at the employee's
 * request. Allowed for Admin and for anyone above the employee in the chain; never for the employee, and never on their own plan.
 * The day is validated like any submit (the employee's own active routes and colleagues). A reason is required and the previous
 * body is kept on the plan.
 *
 * The plan's approval is untouched: an amended draft is still submitted by the employee; an already approved day stays approved
 * (the amender's authority is the approval — they can see and decide what they write). Refused from the end of the day on, and once
 * the employee has submitted that day's DCR, since TA/DA is worked out from the plan's routes.
 */
export class AmendDailyPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly submitter: PlanSubmitter,
    private readonly deadlines: PlanDeadlines,
    private readonly views: PlanViews,
    private readonly isDayReported: () => DayReportedCheck,
    private readonly scope: ManagerScope,
    private readonly approvals: ApprovalsPort,
  ) {}

  async execute(actor: Actor, planId: string, body: Omit<PlanDay, 'dayKind'>, reason: string): Promise<DailyPlanView> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    // An amendment edits the day's contents; whether it's a stay or transit day of a trip stays as the Monthly Plan set it.
    const day: PlanDay = { ...body, dayKind: plan.dayKind };
    if (actor.id === plan.userId) throw AppError.forbidden('You can’t amend your own plan. Ask your manager.');
    if (actor.role !== 'ADMIN' && actor.role !== 'HR') {
      const chain = await this.users.getManagerChain(plan.userId);
      if (!chain.some((m) => m.id === actor.id)) throw AppError.notFound('No such plan.');
    }
    const today = await this.deadlines.today();
    if (plan.planDate < today) {
      throw AppError.conflict('That day is over, so its plan can no longer be amended.');
    }
    // An approved day is decided: Admin and HR can still change it, but only from tomorrow on.
    if (plan.planDate === today && (await this.approvals.getForRecord('DAILY_PLAN', plan.id))?.status === 'APPROVED') {
      throw AppError.conflict('That day is today and already approved, so its plan can no longer be amended. Only days after today can.');
    }
    if (await this.isDayReported()(plan.userId, plan.planDate)) {
      throw AppError.conflict('The daily report for this day is already submitted, so its plan can’t be amended. Ask Admin to reopen the report first.', {
        reason: 'PLAN_DAY_REPORTED',
      });
    }

    await this.submitter.validateDays(plan.userId, [{ day, field: '' }], await this.scope.team(plan.userId, day.workWith));
    const { workingType, dayKind, workWith, routeIds, remarks } = plan;
    const saved = await this.plans.amend(plan.id, plan.revision, day, {
      by: actor.id,
      at: this.deadlines.now(),
      reason,
      previous: { workingType, dayKind, workWith, routeIds, remarks },
    });
    if (!saved) throw AppError.conflict('This plan changed while you were amending it. Reload it and try again.');
    return this.views.daily(saved);
  }
}
