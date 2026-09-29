/** Master records are soft-deleted only: `inactive` hides one from new use but keeps its history. */
export const MASTER_STATUSES = ['active', 'inactive'] as const;
export type MasterStatus = (typeof MASTER_STATUSES)[number];

/** A registered point — both coordinates or neither. `null` means the geofence check can't run. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface PageQuery {
  page: number;
  pageSize: number;
}
