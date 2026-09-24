import type { Route } from './route.entity.js';
import type { TerritoryListQuery } from './territoryStatus.js';

export type RouteListQuery = TerritoryListQuery & {
  areaId?: string | undefined;
  hqId?: string | undefined;
};

export interface RouteRepositoryPort {
  findById(id: string): Promise<Route | null>;
  /** Case-insensitive, within one Area. */
  findByName(areaId: string, name: string): Promise<Route | null>;
  list(query: RouteListQuery): Promise<{ items: Route[]; total: number }>;
  countActiveInArea(areaId: string): Promise<number>;
  create(input: Omit<Route, 'id'>): Promise<Route>;
  /** Fields that don't touch waypoints or distance, so no revision check. */
  update(id: string, input: Partial<Pick<Route, 'name' | 'status' | 'taPerKmRateOverride'>>): Promise<Route>;
  /**
   * Applies `change` and bumps `revision`, but only if the stored revision still equals
   * `expectedRevision`. Returns null when it doesn't — someone else wrote first.
   */
  updateAtRevision(
    id: string,
    expectedRevision: number,
    change: Partial<Pick<Route, 'waypoints' | 'distanceKm' | 'distanceSource' | 'distanceStatus' | 'distanceCalculatedAt'>>,
  ): Promise<Route | null>;
}
