import type { PlaceSummary, RoutePath } from '@/modules/territory/territory.public.js';

/** Field Master Data's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  getRoute(routeId: string): Promise<{ id: string; name: string; hqName: string; status: 'active' | 'inactive'; toPlaceId?: string | null } | null>;
  /** Places (decision-log 2026-11-26): where a doctor, chemist or distributor sits. */
  getPlace(placeId: string): Promise<PlaceSummary | null>;
  getPlaces(placeIds: string[]): Promise<PlaceSummary[]>;
  /** The active places of the HQ an employee is based in. */
  listPlacesForUser(userId: string): Promise<PlaceSummary[]>;
  /** Each person's places, for many at once (2026-11-27); optional so fakes need not add it. */
  listPlacesByUser?(userIds: string[]): Promise<Array<{ userId: string; places: PlaceSummary[] }>>;
  listPlaceIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]>;
  /** The route kept as a record's `routeId` for readers that still go by routes, or `null` when the place has no active route. */
  anchorRouteForPlace(placeId: string): Promise<string | null>;
  /** The Route's HQ and Zone ids and its type, or `null` for an unknown id. */
  getRoutePath(routeId: string): Promise<RoutePath | null>;
  /** Every Route id under an HQ or a Zone (the most specific one given). */
  listRouteIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]>;
  /** Every HQ id under a Zone. */
  listHqIdsInZone(zoneId: string): Promise<string[]>;
  getHq(hqId: string): Promise<{ id: string; zoneId: string; name: string; status: 'active' | 'inactive' } | null>;
  getZone(zoneId: string): Promise<{ id: string; name: string; status: 'active' | 'inactive' } | null>;
  /** The active Routes an employee currently covers. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string; hqId: string }>>;
}
