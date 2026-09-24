/**
 * Every Territory level is soft-deleted only (decision-log 2026-09-24): `inactive` hides a node
 * from new use but keeps it for history, since Plans and Expenses will reference it.
 */
export const TERRITORY_STATUSES = ['active', 'inactive'] as const;
export type TerritoryStatus = (typeof TERRITORY_STATUSES)[number];

export interface TerritoryListQuery {
  page: number;
  pageSize: number;
  sortOrder?: 'asc' | 'desc';
  /** Case-insensitive substring match on `name`. */
  search?: string | undefined;
  status?: TerritoryStatus | undefined;
}
