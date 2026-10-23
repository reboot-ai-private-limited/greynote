import type { ManagerCoverageRepositoryPort } from '../../domain/managerCoverage.repository.port.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteSummary } from '../../domain/routeView.js';
import { toRouteSummaries } from './routeSummaries.js';

/**
 * The active Routes an employee currently covers — Planning's route picker offers exactly these
 * (LLD). An inactive Route can't have active assignments, but is filtered anyway so the answer
 * never depends on that rule holding.
 *
 * For any designation: a covered HQ where the employee has no route assigned brings every route of that HQ, and a covered Zone that names
 * none of its HQs brings all its HQs. Once routes are assigned within an HQ, only those count there.
 */
export class ListRoutesForUserUseCase {
  constructor(
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly coverage?: ManagerCoverageRepositoryPort,
  ) {}

  async execute(userId: string): Promise<RouteSummary[]> {
    const active = await this.assignments.listActiveForUser(userId);
    const assigned = await this.routes.findByIds(active.map((a) => a.routeId));
    const ids = new Set(assigned.map((r) => r.id));
    const hqsWithAssigned = new Set(assigned.map((r) => r.hqId));
    for (const hqId of await this.coveredHqIds(userId)) {
      if (hqsWithAssigned.has(hqId)) continue;
      for (const id of await this.routes.listIdsInScope({ hqId })) ids.add(id);
    }
    const routes = (await this.routes.findByIds([...ids])).filter((r) => r.status === 'active');
    const summaries = await toRouteSummaries(this.hqs, routes);
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The HQs the employee covers: those named, and every HQ of a covered Zone that has none of its HQs named. */
  private async coveredHqIds(userId: string): Promise<string[]> {
    const found = await this.coverage?.find(userId);
    if (!found) return [];
    const named = await this.hqs.findByIds(found.hqIds);
    const namedZones = new Set(named.map((h) => h.zoneId));
    const ids = new Set(named.filter((h) => h.status === 'active').map((h) => h.id));
    for (const zoneId of found.zoneIds.filter((z) => !namedZones.has(z))) {
      const all = await this.hqs.list({ page: 1, pageSize: 1000, zoneId });
      for (const hq of all.items) if (hq.status === 'active') ids.add(hq.id);
    }
    return [...ids];
  }
}
