import type { RoutePath } from '@/modules/territory/territory.public.js';

/** Field Master Data's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  getRoute(routeId: string): Promise<{ id: string; name: string; hqName: string; status: 'active' | 'inactive' } | null>;
  /** The Route's HQ and Zone ids and its type, or `null` for an unknown id. */
  getRoutePath(routeId: string): Promise<RoutePath | null>;
  /** Every Route id under an HQ or a Zone (the most specific one given). */
  listRouteIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]>;
  /** The active Routes an employee currently covers. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string }>>;
}
