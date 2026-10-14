import type { Route, RouteType } from './route.entity.js';
import type { TerritoryListQuery } from './territoryStatus.js';

export type RouteListQuery = TerritoryListQuery & {
  hqId?: string | undefined;
  zoneId?: string | undefined;
  type?: RouteType | undefined;
};

export interface RouteRepositoryPort {
  findById(id: string): Promise<Route | null>;
  findByIds(ids: string[]): Promise<Route[]>;
  /** Case-insensitive, within one HQ. */
  findByName(hqId: string, name: string): Promise<Route | null>;
  list(query: RouteListQuery): Promise<{ items: Route[]; total: number }>;
  countActiveInHq(hqId: string): Promise<number>;
  /** Every Route of one HQ, any status — what an HQ rename re-names. */
  listInHq(hqId: string): Promise<Route[]>;
  /** Every Route id under an HQ or a Zone (through its HQs) — any status. */
  listIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]>;
  create(input: Omit<Route, 'id'>): Promise<Route>;
  update(
    id: string,
    input: Partial<Pick<Route, 'name' | 'destinationName' | 'type' | 'typeSource' | 'distanceKm' | 'status' | 'taPerKmRateOverridePaise'>>,
  ): Promise<Route>;
}
