import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteSummary } from '../../domain/routeView.js';
import { toRouteSummaries } from './routeSummaries.js';

/**
 * The active Routes an employee currently covers — Planning's route picker offers exactly these
 * (LLD). An inactive Route can't have active assignments, but is filtered anyway so the answer
 * never depends on that rule holding.
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
