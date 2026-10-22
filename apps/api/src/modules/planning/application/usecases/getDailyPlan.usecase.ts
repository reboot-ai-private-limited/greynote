import { AppError } from '@/shared/errors/AppError.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { PlanRoute, RouteDirectoryPort } from '../../domain/routeDirectory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assertCanRead, type Actor } from '../planAccess.js';
import { namePlanRoutes } from '../planRoutes.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

export class GetDailyPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly views: PlanViews,
    private readonly routes: RouteDirectoryPort,
  ) {}

  /** `routes`: the plan's routes named and typed, for a reader (a manager) who doesn't hold them. */
  async execute(actor: Actor, planId: string): Promise<DailyPlanView & { routes: PlanRoute[] }> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    await assertCanRead(this.users, actor, plan.userId);
    const [view, routes] = await Promise.all([this.views.daily(plan), namePlanRoutes(this.routes, plan.routeIds)]);
    return { ...view, routes };
  }
}
