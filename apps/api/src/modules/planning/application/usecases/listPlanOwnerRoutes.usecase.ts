import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { PlanRoute, RouteDirectoryPort } from '../../domain/routeDirectory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ManagerScope } from '../managerScope.js';
import { assertCanRead, type Actor } from '../planAccess.js';
import { namePlanRoutes } from '../planRoutes.js';

/**
 * The active routes the employee a Monthly Plan belongs to may plan — what a manager editing that plan may choose from: their own, and for
 * a manager also the routes held by anyone below them (the same rule the plan is validated with, decision-log 2026-11-17). Readable by
 * the same people as the plan (the owner, anyone above them, Admin), and only through a plan, so it is not a way to list anyone's routes.
 */
export class ListPlanOwnerRoutesUseCase {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly routes: RouteDirectoryPort,
    private readonly scope?: ManagerScope,
  ) {}

  async execute(actor: Actor, planId: string): Promise<PlanRoute[]> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    await assertCanRead(this.users, actor, plan.userId);
    const mine = await this.routes.listRoutesForUsers([plan.userId, ...(this.scope ? await this.scope.routePeople(plan.userId) : [])]);
    const named = await namePlanRoutes(this.routes, mine.map((r) => r.id));
    return named.sort((a, b) => a.name.localeCompare(b.name));
  }
}
