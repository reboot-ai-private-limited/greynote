import { logger } from '@/shared/logging/logger.js';
import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { RouteDistanceFields, Waypoint } from '../../domain/route.entity.js';

/**
 * Asks the provider for the road distance through `waypoints` and turns the answer into the
 * fields a Route stores. Always `AUTO_CALCULATED` — this is what resets a manual override. A
 * failure becomes `FAILED` with no distance, never an error: the Route still saves, and TA
 * flags it later (HLD 02 §4).
 */
export async function calculateDistance(
  provider: DistanceProviderPort,
  waypoints: Waypoint[],
): Promise<RouteDistanceFields> {
  const result = await provider.roadDistance(waypoints);
  if (!result.ok) {
    logger.warn({ reason: result.reason, waypoints: waypoints.length }, 'route distance calculation failed');
    return { distanceKm: null, distanceSource: 'AUTO_CALCULATED', distanceStatus: 'FAILED', distanceCalculatedAt: null };
  }
  return {
    distanceKm: (result.meters / 1000).toFixed(2),
    distanceSource: 'AUTO_CALCULATED',
    distanceStatus: 'CALCULATED',
    distanceCalculatedAt: new Date(),
  };
}
