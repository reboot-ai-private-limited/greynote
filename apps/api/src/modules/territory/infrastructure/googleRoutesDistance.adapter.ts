import type { DistanceProviderPort, DistanceResult, GeoPoint } from '../domain/distanceProvider.port.js';
import { googlePost, isGoogleConfigured } from './googleMaps.js';

const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const toLocation = (p: GeoPoint) => ({ location: { latLng: { latitude: p.latitude, longitude: p.longitude } } });

/** Google Routes API (`computeRoutes`), the successor to the legacy Directions API. */
export class GoogleRoutesDistanceAdapter implements DistanceProviderPort {
  async roadDistance(points: GeoPoint[]): Promise<DistanceResult> {
    if (!isGoogleConfigured()) return { ok: false, reason: 'GOOGLE_MAPS_API_KEY not set' };
    const origin = points[0];
    const destination = points.at(-1);
    if (!origin || !destination || points.length < 2) return { ok: false, reason: 'fewer than 2 points' };

    try {
      const res = await googlePost(COMPUTE_ROUTES_URL, 'routes.distanceMeters', {
        origin: toLocation(origin),
        destination: toLocation(destination),
        intermediates: points.slice(1, -1).map(toLocation),
        travelMode: 'DRIVE',
        // The waypoint order is the route Admin drew, and TA is paid on it — never reorder.
        optimizeWaypointOrder: false,
      });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };

      const body = (await res.json()) as { routes?: Array<{ distanceMeters?: number }> };
      const meters = body.routes?.[0]?.distanceMeters;
      // No `routes` at all means Google found no drivable path between the points.
      if (meters === undefined) return { ok: false, reason: 'no drivable route found' };
      return { ok: true, meters };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
    }
  }
}
