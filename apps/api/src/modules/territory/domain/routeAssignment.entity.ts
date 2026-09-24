import type { TerritoryStatus } from './territoryStatus.js';

/**
 * One MR's coverage of one Route, many-to-many. Never overwritten or deleted: unassigning marks
 * the row `inactive`, and assigning again later creates a new row, so the table is the
 * assignment history (ERD 02). At most one `active` row per (route, user).
 */
export interface RouteAssignment {
  id: string;
  routeId: string;
  userId: string;
  status: TerritoryStatus;
  assignedAt: Date;
  assignedBy: string;
  unassignedAt: Date | null;
  unassignedBy: string | null;
}
