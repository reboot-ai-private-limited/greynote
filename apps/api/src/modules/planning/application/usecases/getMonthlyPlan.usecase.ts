import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlan } from '../../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { PlanRoute, RouteDirectoryPort } from '../../domain/routeDirectory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assertCanRead, type Actor } from '../planAccess.js';
import { namePlanRoutes } from '../planRoutes.js';
import type { MonthlyPlanView, PlanViews } from '../planViews.js';

export class GetMonthlyPlanUseCase {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly views: PlanViews,
    private readonly routes: RouteDirectoryPort,
  ) {}

  /** `routes`: every route the month's entries (and the days an amendment replaced) name, once each, named and typed — look an entry's `routeIds` up in it. */
  async execute(actor: Actor, planId: string): Promise<MonthlyPlanView & { routes: PlanRoute[] }> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    return this.read(actor, plan);
  }

  /** The plan of one employee for one month (`YYYY-MM`), read the same way — for a screen that knows who and when, not the plan's id. */
  async forUserMonth(actor: Actor, userId: string, planMonth: string): Promise<MonthlyPlanView & { routes: PlanRoute[] }> {
    // Unreadable and missing look the same, so this is not a way to learn who has a plan.
    await assertCanRead(this.users, actor, userId).catch(() => {
      throw AppError.notFound('No plan for that month.');
    });
    const plan = await this.plans.findByUserAndMonth(userId, planMonth);
    if (!plan) throw AppError.notFound('No plan for that month.');
    return this.read(actor, plan);
  }

  private async read(actor: Actor, plan: MonthlyPlan): Promise<MonthlyPlanView & { routes: PlanRoute[] }> {
    await assertCanRead(this.users, actor, plan.userId);
    const [view, routes] = await Promise.all([
      this.views.monthly(plan),
      namePlanRoutes(this.routes, [...plan.entries, ...plan.amendments.flatMap((a) => a.previous)].flatMap((e) => e.routeIds)),
    ]);
    return { ...view, routes };
  }
}
