/** Field Activity's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  /** The active Routes an employee currently covers. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string }>>;
  /** A Route's TA/DA inputs (`distanceKm` is null when `distanceStatus` is `FAILED`), or `null` for an unknown id. */
  getRoute(routeId: string): Promise<{
    id: string;
    name: string;
    routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
    distanceKm: string | null;
    distanceStatus: string;
    taPerKmRateOverridePaise: number | null;
    taFixedPaise?: number | null;
  } | null>;
  /** Places and the employee's own HQ (2026-11-26): what the From → To TA/DA is measured against. */
  getPlace(placeId: string): Promise<{ id: string; hqId: string; type: 'HQ' | 'EX_STATION' | 'OUT_STATION'; isHqTown: boolean } | null>;
  getUserHq(userId: string): Promise<{ hqId: string; zoneId: string } | null>;
  findRouteBetween(placeA: string, placeB: string): Promise<{
    id: string;
    routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
    distanceKm: string | null;
    distanceStatus: string;
    taPerKmRateOverridePaise: number | null;
    taFixedPaise?: number | null;
    status: 'active' | 'inactive';
  } | null>;
  anchorRouteForPlace(placeId: string): Promise<string | null>;
}
