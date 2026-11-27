import type { Route, RouteChange, RouteType } from './route.entity.js';
import type { TerritoryListQuery } from './territoryStatus.js';

export type RouteListQuery = TerritoryListQuery & {
  hqId?: string | undefined;
  zoneId?: string | undefined;
  type?: RouteType | undefined;
  /** Routes with this place at either end. */
  placeId?: string | undefined;
  /** Routes with either end at a place of this HQ, whichever HQ the route belongs to (2026-11-27, the Territory page). */
  touchingHqId?: string | undefined;
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
  /**
   * Active routes whose both ends are places of these HQs (a route not yet migrated: whose HQ is one of them) — what someone based in, or
   * managing people in, these HQs may plan (decision-log 2026-11-26).
   */
  listActiveWithinHqs(hqIds: string[]): Promise<Route[]>;
  /** The route between two places, whichever way round it was typed. */
  findByPair(placeA: string, placeB: string): Promise<Route | null>;
  /** Every route with this place at either end, any status — what a place rename or type change touches. */
  listTouchingPlace(placeId: string): Promise<Route[]>;
  countActiveTouchingPlace(placeId: string): Promise<number>;
  create(input: Omit<Route, 'id'>): Promise<Route>;
  update(id: string, input: RouteChange): Promise<Route>;
}
