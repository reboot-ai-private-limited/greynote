import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import { isFieldDay, type PlanDay } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assertEditable } from '../assertEditable.js';
import type { CarryOver } from '../carryOver.js';
import type { ManagerScope } from '../managerScope.js';
import type { PlanSubmitter } from '../planSubmitter.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

export interface ManagerDayInput {
  workWith: string[];
  routeIds: string[];
  doctorIds: string[];
  remarks: string | null;
}

/** Every person below the manager at any depth, active or not, is a possible `workWith` — checked here, against today's team. */
export async function assertInDownline(users: UserDirectoryPort, managerId: string, ids: string[], field: string): Promise<void> {
  if (ids.length === 0) return;
  const below = new Set((await users.getDownline(managerId)).filter((u) => u.status === 'active').map((u) => u.id));
  const outside = ids.filter((id) => !below.has(id));
  if (outside.length > 0) {
    throw AppError.badRequest('You can only work with active people in your team.', { field, userIds: outside });
  }
}

/**
 * A manager (any designation above MR) plans their own day: who they work with (anyone in their team), the routes and the doctors.
 * The routes and doctors may come from the caller or from the team members named. It replaces the inherited body, so the plan
 * becomes `MANUAL` and a later Monthly Plan approval leaves it alone. Editable only while the plan is. A trip's stay and
 * transit days keep the trip's routes; change the first day to change the trip.
 */
export class SetManagerDayPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly users: UserDirectoryPort,
    private readonly submitter: PlanSubmitter,
    private readonly carryOver: CarryOver,
    private readonly scope: ManagerScope,
    private readonly views: PlanViews,
  ) {}

  async execute(userId: string, planDate: string, input: ManagerDayInput): Promise<DailyPlanView> {
    if (!(await this.scope.isManager(userId))) {
      throw AppError.forbidden('Only a manager can plan the day with their team. Pick your doctors instead.');
    }
    const plan = await this.plans.findByUserAndDate(userId, planDate);
    if (!plan) throw AppError.notFound('There is no plan for this day. Your monthly plan has to cover it first.');
    await assertEditable(this.approvals, 'DAILY_PLAN', plan.id);

    const field = isFieldDay(plan.workingType);
    if (!field && (input.routeIds.length > 0 || input.doctorIds.length > 0)) {
      throw AppError.badRequest('Only a field work or doctor campaign day has routes and doctors.', { field: 'routeIds' });
    }
    if (plan.dayKind !== 'NORMAL' && [...input.routeIds].sort().join() !== [...plan.routeIds].sort().join()) {
      throw AppError.badRequest('This is a day of a trip, which keeps the trip’s routes. Change the trip’s first day instead.', { field: 'routeIds' });
    }
    await assertInDownline(this.users, userId, input.workWith, 'workWith');

    const day: PlanDay = { workingType: plan.workingType, dayKind: plan.dayKind, workWith: input.workWith, routeIds: input.routeIds, remarks: input.remarks };
    await this.submitter.validateDays(userId, [{ day, field: '' }], input.workWith);
    const doctors = field
      ? await this.carryOver.compose({ userId, planDate, routeIds: input.routeIds }, input.doctorIds, await this.scope.doctorScope(userId, input.workWith))
      : [];

    const saved = await this.plans.saveManagerDay(plan.id, plan.revision, day, doctors);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    return this.views.daily(saved);
  }
}
