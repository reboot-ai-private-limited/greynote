import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteSummary } from '../../domain/routeView.js';
import { toRouteSummaries } from './routeSummaries.js';

/** Contract read: `null` for an unknown id, so the caller decides whether that's an error. */
export class GetRouteSummaryUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(routeId: string): Promise<RouteSummary | null> {
    const route = await this.routes.findById(routeId);
    if (!route) return null;
    const [summary] = await toRouteSummaries(this.hqs, [route]);
    return summary ?? null;
  }
}
