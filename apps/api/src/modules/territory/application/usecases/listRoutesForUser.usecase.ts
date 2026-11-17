import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteSummary } from '../../domain/routeView.js';
import { toRouteSummaries } from './routeSummaries.js';

/**
 * The active Routes held by any of these employees, each once, in one assignment query plus one route lookup — what a manager's plan may
 * name: the routes of everyone below them (decision-log 2026-11-17), not a copy kept on the manager.
 */
export class ListRoutesForUsersUseCase {
  constructor(
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(userIds: string[]): Promise<RouteSummary[]> {
    const active = await this.assignments.listActiveForUsers(userIds);
    const routes = (await this.routes.findByIds([...new Set(active.map((a) => a.routeId))])).filter((r) => r.status === 'active');
    return (await toRouteSummaries(this.hqs, routes)).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Who holds each of these routes now: `{ routeId, userId }` pairs. */
  async holders(routeIds: string[]): Promise<Array<{ routeId: string; userId: string }>> {
    return (await this.assignments.listActiveForRoutes(routeIds)).map((a) => ({ routeId: a.routeId, userId: a.userId }));
  }
}

/**
 * The active Routes an employee currently has — Planning's route picker offers exactly these (LLD). Only stored assignments count: covering an
 * HQ or Zone gives no route by itself, so this list, the route's Assigned card and Remove always agree. An inactive Route can't have active
 * assignments, but is filtered anyway so the answer never depends on that rule holding.
 */
export class ListRoutesForUserUseCase {
  constructor(
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(userId: string): Promise<RouteSummary[]> {
    const active = await this.assignments.listActiveForUser(userId);
    const routes = (await this.routes.findByIds(active.map((a) => a.routeId))).filter((r) => r.status === 'active');
    const summaries = await toRouteSummaries(this.hqs, routes);
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }
}
