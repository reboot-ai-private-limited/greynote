import type { Place } from './place.entity.js';
import type { RouteType } from './route.entity.js';
import type { TerritoryListQuery } from './territoryStatus.js';

export type PlaceListQuery = TerritoryListQuery & {
  hqId?: string | undefined;
  zoneId?: string | undefined;
  type?: RouteType | undefined;
};

export interface PlaceRepositoryPort {
  findById(id: string): Promise<Place | null>;
  findByIds(ids: string[]): Promise<Place[]>;
  /** Case-insensitive, within one HQ. */
  findByName(hqId: string, name: string): Promise<Place | null>;
  findHqTown(hqId: string): Promise<Place | null>;
  list(query: PlaceListQuery): Promise<{ items: Place[]; total: number }>;
  /** Active places other than the HQ town: what stops an HQ being deactivated. */
  countActiveOutsideTownInHq(hqId: string): Promise<number>;
  create(input: Omit<Place, 'id'>): Promise<Place>;
  update(id: string, input: Partial<Pick<Place, 'name' | 'type' | 'status'>>): Promise<Place>;
}
