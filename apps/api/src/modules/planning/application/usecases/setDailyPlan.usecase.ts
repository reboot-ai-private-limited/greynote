import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlan } from '../../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import { isFieldDay, sameDay, type PlanDay, type PlanSource, type WorkingType } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assertEditable } from '../assertEditable.js';
import { assertInDownline } from '../assertInDownline.js';
import type { CarryOver } from '../carryOver.js';
import type { ManagerScope } from '../managerScope.js';
import type { PlanSubmitter } from '../planSubmitter.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';
import type { SuggestFromTeamUseCase } from './suggestFromTeam.usecase.js';

export interface DayInput {
  workingType: WorkingType;
  workWith: string[];
  doctorIds: string[];
}

const bodyOf = (p: PlanDay): PlanDay => ({ workingType: p.workingType, dayKind: p.dayKind, workWith: p.workWith, routeIds: p.routeIds, remarks: p.remarks });

/**
 * The owner changes their own Daily Plan for a day — working type, work with and doctors (decision-log 2026-10-14). Any field
 * employee, while the plan is a draft, rejected, withdrawn or reopened; an approved day still goes through the manager's amend.
 * Routes and remarks are not theirs to change: they are the Monthly Plan's.
 *
 * - **Routes** follow the type. A meeting, conference or strike has none (and no doctors). A field work or doctor campaign day takes
 *   the Monthly Plan's routes — also when the day was switched away and back, from what `plannedFrom` kept — except for a manager who
 *   names team members to work with: their routes are then those people's (their Daily Plan's, else their Monthly Plan's), since the
 *   manager goes where the team goes. A trip's stay and transit days keep their type and routes.
 * - **Doctors** are assigned to the owner (or, for a manager, to a named team member) and on the day's routes.
 *
 * The first change keeps what the Monthly Plan said (`plannedFrom`), so the approver sees "changed from monthly"; saving the day
 * back as the Monthly Plan wrote it clears that and the plan is the Monthly Plan's again. A changed day is the owner's own
 * (`MANUAL`), so approving the month again doesn't overwrite it.
 */
export class SetDailyPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly users: UserDirectoryPort,
    private readonly submitter: PlanSubmitter,
    private readonly carryOver: CarryOver,
    private readonly scope: ManagerScope,
    private readonly suggest: SuggestFromTeamUseCase,
    private readonly views: PlanViews,
  ) {}

  async execute(userId: string, planDate: string, input: DayInput): Promise<DailyPlanView> {
    const plan = await this.plans.findByUserAndDate(userId, planDate);
    if (!plan) throw AppError.notFound('There is no plan for this day. Your monthly plan has to cover it first.');
    await assertEditable(this.approvals, 'DAILY_PLAN', plan.id);

    const field = isFieldDay(input.workingType);
    if (!field && input.doctorIds.length > 0) {
      throw AppError.badRequest('Only a field work or doctor campaign day has doctors.', { field: 'doctorIds' });
    }
    const manager = await this.scope.isManager(userId);
    if (manager) await assertInDownline(this.users, userId, input.workWith, 'workWith');

    // The Monthly Plan's version of the day: kept from the first change, or read off the day while it is still the Monthly Plan's.
    const original = plan.plannedFrom ?? (plan.source === 'MONTHLY' ? bodyOf(plan) : null);
    const routeIds = await this.routesFor(plan, input, field, manager, original);

    const day: PlanDay = { workingType: input.workingType, dayKind: plan.dayKind, workWith: input.workWith, routeIds, remarks: plan.remarks };
    await this.submitter.validateDays(userId, [{ day, field: '' }], manager ? input.workWith : []);
    const doctors = field
      ? await this.carryOver.compose({ userId, planDate, routeIds }, input.doctorIds, await this.scope.doctorScope(userId, input.workWith))
      : [];

    const origin: { source: PlanSource; plannedFrom: PlanDay | null } =
      original && sameDay(original, day) ? { source: 'MONTHLY', plannedFrom: null } : { source: 'MANUAL', plannedFrom: original };

    const saved = await this.plans.saveOwnDay(plan.id, plan.revision, day, doctors, origin);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    return this.views.daily(saved);
  }

  private async routesFor(plan: DailyPlan, input: DayInput, field: boolean, manager: boolean, original: PlanDay | null): Promise<string[]> {
    if (plan.dayKind !== 'NORMAL') {
      if (input.workingType !== plan.workingType) {
        throw AppError.badRequest('This is a day of a trip, which keeps the trip’s type and routes. Change the trip’s first day instead.', { field: 'workingType' });
      }
      return plan.routeIds;
    }
    if (!field) return [];
    if (manager && input.workWith.length > 0) {
      const routes = (await this.suggest.forPeople(plan.planDate, input.workWith)).routeIds;
      if (routes.length === 0) {
        throw AppError.badRequest('None of the people you picked has routes planned for this day. Pick other people, or work alone.', { field: 'workWith' });
      }
      return routes;
    }
    const monthlyRoutes = (original ?? plan).routeIds;
    if (monthlyRoutes.length === 0) {
      throw AppError.badRequest('The monthly plan has no routes for this day, so it can’t be a field work day.', { field: 'workingType' });
    }
    return monthlyRoutes;
  }
}
