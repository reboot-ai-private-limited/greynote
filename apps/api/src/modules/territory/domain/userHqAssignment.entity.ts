import type { TerritoryStatus } from './territoryStatus.js';

/**
 * A FIELD employee's HQ (decision-log 2026-09-28). At most one `active` row per user; setting a
 * new HQ ends the old row and starts a new one, so the table is the history — the same shape as
 * `RouteAssignment`.
 */
export interface UserHqAssignment {
  id: string;
  userId: string;
  hqId: string;
  status: TerritoryStatus;
  assignedAt: Date;
  assignedBy: string;
  unassignedAt: Date | null;
  unassignedBy: string | null;
}
