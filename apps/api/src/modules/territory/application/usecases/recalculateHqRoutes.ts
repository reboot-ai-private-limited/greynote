import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { Place } from '../../domain/place.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { calculateDistance } from './routeDistance.js';

/** What an HQ base-place change did to its Routes (decision-log 2026-10-03). */
export interface RouteRecalculationReport {
  /** Routes that now have a freshly calculated distance. */
  recalculated: number;
  /** Routes whose distance could not be calculated (provider failed) or that changed under us. */
  failed: number;
  /** Manually overridden Routes, left as they were — Admin should re-check these. */
  overridden: Array<{ id: string; name: string }>;
}

/**
 * Recalculates every active Route of an HQ from its new base place, except manual overrides: an
 * HQ edit is not an edit to that Route, and silently discarding hand-entered distances in bulk
 * would lose data. One Route failing never stops the rest. Each write is revision-checked, so a
 * concurrent edit of a Route wins and is counted as `failed` (Admin retries it from the Route).
 */
export async function recalculateHqRoutes(
  routes: RouteRepositoryPort,
  provider: DistanceProviderPort,
  hqId: string,
  basePlace: Place,
): Promise<RouteRecalculationReport> {
  const report: RouteRecalculationReport = { recalculated: 0, failed: 0, overridden: [] };
  for (const route of await routes.listActiveInHq(hqId)) {
    if (route.distanceSource === 'MANUAL_OVERRIDE') {
      report.overridden.push({ id: route.id, name: route.name });
      continue;
    }
    const distance = await calculateDistance(provider, basePlace, route.destination);
    const updated = await routes.updateAtRevision(route.id, route.revision, distance);
    if (updated && updated.distanceStatus === 'CALCULATED') report.recalculated += 1;
    else report.failed += 1;
  }
  return report;
}
