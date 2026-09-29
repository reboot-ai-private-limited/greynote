import type { RoutePath } from '@/modules/territory/territory.public.js';

/** Field Master Data's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  getRoute(routeId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  /** The Route's Area / HQ / Zone ids and Area type, or `null` for an unknown id. */
  getRoutePath(routeId: string): Promise<RoutePath | null>;
  /** Every Route id under an Area, an HQ or a Zone (the most specific one given). */
  listRouteIdsInScope(scope: { areaId?: string | undefined; hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]>;
  /** The active Routes an employee currently covers. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string }>>;
}
