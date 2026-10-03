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
  /** Every active Route of one HQ — what an HQ base-place change recalculates. */
  listActiveInHq(hqId: string): Promise<Route[]>;
  /** Every Route id under an HQ or a Zone (through its HQs) — any status. */
  listIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]>;
  create(input: Omit<Route, 'id'>): Promise<Route>;
  /** Fields that don't touch the destination or distance, so no revision check. */
  update(id: string, input: Partial<Pick<Route, 'name' | 'type' | 'status' | 'taPerKmRateOverridePaise'>>): Promise<Route>;
  /**
   * Applies `change` and bumps `revision`, but only if the stored revision still equals
   * `expectedRevision`. Returns null when it doesn't — someone else wrote first.
   */
  updateAtRevision(
    id: string,
    expectedRevision: number,
    change: Partial<Pick<Route, 'destination' | 'distanceKm' | 'distanceSource' | 'distanceStatus' | 'distanceCalculatedAt'>>,
  ): Promise<Route | null>;
}
