/** Field Activity's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  /** The active Routes an employee currently covers. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string }>>;
  /** A Route's TA/DA inputs (`distanceKm` is null when `distanceStatus` is `FAILED`), or `null` for an unknown id. */
  getRoute(routeId: string): Promise<{
    id: string;
    areaType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
    distanceKm: string | null;
    distanceStatus: string;
    taPerKmRateOverridePaise: number | null;
  } | null>;
}
