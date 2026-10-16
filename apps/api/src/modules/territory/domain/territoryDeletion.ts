import type { RouteType } from './route.entity.js';

export type TerritoryKind = 'ZONE' | 'HQ' | 'ROUTE';

/** The item being deleted and everything under it. */
export interface DeletionScope {
  kind: TerritoryKind;
  id: string;
  name: string;
  zones: Array<{ id: string; name: string }>;
  hqs: Array<{ id: string; name: string; zoneId: string; zoneName: string }>;
  routes: Array<{
    id: string;
    name: string;
    hqId: string;
    hqName: string;
    zoneId: string;
    zoneName: string;
    type: RouteType;
    destinationName: string;
    distanceKm: string | null;
    taPerKmRateOverridePaise: number | null;
  }>;
}

export interface PeopleAffected {
  total: number;
  routes: number;
  hq: number;
  coverage: number;
}

/** What a deleted item was, as kept in the archive. */
export interface ArchivedItem {
  kind: TerritoryKind;
  id: string;
  name: string;
  zoneId: string | null;
  zoneName: string | null;
  hqId: string | null;
  hqName: string | null;
  routeType: RouteType | null;
  distanceKm: string | null;
  taPerKmRateOverridePaise: number | null;
}

export interface TerritoryDeletionStorePort {
  /** The item and everything under it, or `null` for an unknown id. */
  resolve(kind: TerritoryKind, id: string): Promise<DeletionScope | null>;
  countPeople(scope: DeletionScope): Promise<PeopleAffected>;
  /**
   * Deletes it all in one transaction: archives each item, removes route assignments and coverage entries, ends main-HQ assignments, then
   * removes the Routes, HQs and Zones.
   */
  remove(scope: DeletionScope, actorId: string, batchId: string): Promise<void>;
  /** A deleted item's archive row, or `null`. */
  findArchived(kind: TerritoryKind, id: string): Promise<ArchivedItem | null>;
}
