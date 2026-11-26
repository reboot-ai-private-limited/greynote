import type { RouteDirectoryPort } from '../../domain/routeDirectory.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlan } from '../../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import { isFieldDay, sameDay, type PlanDay, type PlanSource, type WorkingType } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assertEditable } from '../assertEditable.js';
import type { CarryOver } from '../carryOver.js';
import type { ManagerScope } from '../managerScope.js';
import type { PlanSubmitter } from '../planSubmitter.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

export interface DayInput {
  workingType: WorkingType;
  workWith: string[];
  doctorIds: string[];
  /** Ignored since 2026-11-19: a day's routes are the Tour Plan's. Kept so an older app's request still validates. */
  routeIds?: string[] | undefined;
}

const bodyOf = (p: PlanDay): PlanDay => ({ workingType: p.workingType, dayKind: p.dayKind, workWith: p.workWith, routeIds: p.routeIds, fromPlaceId: p.fromPlaceId, toPlaceId: p.toPlaceId, remarks: p.remarks });

/**
 * The owner changes their own Daily Plan for a day — working type, work with and doctors (decision-log 2026-10-14). Any field
 * employee, while the plan is a draft, rejected, withdrawn or reopened; an approved day still goes through the manager's amend.
 * Routes and remarks are not theirs to change: they are the Monthly Plan's.
 *
 * - **Routes** follow the type. A meeting, conference or strike has none (and no doctors). A field work or doctor campaign day takes
 *   the Monthly Plan's routes — also when the day was switched away and back, from what `plannedFrom` kept. A manager's "Works with" lists only
 *   the people below them who hold those routes and the doctor list only the doctors on those routes. Nobody on the route, or someone
 *   else wanted, means the plan is changed by the manager above or Admin (amend). A trip's stay and transit days keep their type and routes.
 * - **Doctors** are assigned to the owner (or, for a manager, to anyone below them) and on the day's routes.
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
    private readonly views: PlanViews,
    private readonly routes?: Pick<RouteDirectoryPort, 'anchorRouteForPlace'>,
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

    // The Monthly Plan's version of the day: kept from the first change, or read off the day while it is still the Monthly Plan's.
    const original = plan.plannedFrom ?? (plan.source === 'MONTHLY' ? bodyOf(plan) : null);
    const routeIds = await this.routesFor(plan, input, field, original);
    // A day spent at one place has no route: who works it with the manager is whoever holds the route that reaches the place.
    const held = routeIds.length > 0 ? routeIds : await this.anchorOf((plan.dayKind !== 'NORMAL' ? plan : (original ?? plan)).toPlaceId ?? null);
    if (manager && field) await this.assertWorkWithOnRoutes(userId, held, input.workWith);

    // The places are the Tour Plan's too (2026-11-26); a meeting, conference or strike has none.
    const source = plan.dayKind !== 'NORMAL' ? plan : (original ?? plan);
    const day: PlanDay = {
      workingType: input.workingType,
      dayKind: plan.dayKind,
      workWith: input.workWith,
      routeIds,
      fromPlaceId: field ? (source.fromPlaceId ?? null) : null,
      toPlaceId: field ? (source.toPlaceId ?? null) : null,
      remarks: plan.remarks,
    };
    await this.submitter.validateDays(userId, [{ day, field: '' }]);
    const doctors = field
      ? await this.carryOver.compose({ userId, planDate, routeIds, toPlaceId: day.toPlaceId }, input.doctorIds, await this.scope.doctorScope(userId, input.workWith))
      : [];

    const origin: { source: PlanSource; plannedFrom: PlanDay | null } =
      // "Works with" is chosen on the day itself (the Tour Plan has none), so it never makes the day "changed from monthly".
      original && sameDay({ ...original, workWith: day.workWith }, day) ? { source: 'MONTHLY', plannedFrom: null } : { source: 'MANUAL', plannedFrom: original };

    const saved = await this.plans.saveOwnDay(plan.id, plan.revision, day, doctors, origin);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    return this.views.daily(saved);
  }

  private async anchorOf(placeId: string | null): Promise<string[]> {
    const anchor = placeId && this.routes?.anchorRouteForPlace ? await this.routes.anchorRouteForPlace(placeId) : null;
    return anchor ? [anchor] : [];
  }

  /** A manager's "Works with" for a day: only people below them who hold the day's routes (or the managers above those holders). */
  private async assertWorkWithOnRoutes(ownerId: string, routeIds: string[], workWith: string[]): Promise<void> {
    if (workWith.length === 0) return;
    const allowed = await this.scope.workWithCandidates(ownerId, routeIds);
    const unknown = workWith.filter((id) => !allowed.has(id));
    if (unknown.length > 0) {
      throw AppError.badRequest('Pick people who hold this day’s routes. Nobody to pick, or someone missing? Ask your manager or Admin to change the plan.', { field: 'workWith', userIds: unknown });
    }
  }

  private async routesFor(plan: DailyPlan, input: DayInput, field: boolean, original: PlanDay | null): Promise<string[]> {
    if (plan.dayKind !== 'NORMAL') {
      if (input.workingType !== plan.workingType) {
        throw AppError.badRequest('This is a day of a trip, which keeps the trip’s type and routes. Change the trip’s first day instead.', { field: 'workingType' });
      }
      return plan.routeIds;
    }
    if (!field) return [];
    const monthlyRoutes = (original ?? plan).routeIds;
    if (monthlyRoutes.length === 0) {
      throw AppError.badRequest('The monthly plan has no routes for this day, so it can’t be a field work day.', { field: 'workingType' });
    }
    // Routes are the Tour Plan's, for a manager too (decision-log 2026-11-19): `input.routeIds` from an older app is ignored. A different route is a change to the Tour Plan.
    return monthlyRoutes;
  }
}
