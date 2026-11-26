export interface TerritoryGap {
  managerId: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  level: number;
  /** Direct reports whose territory was looked at. */
  reports: number;
  /** What the direct reports cover or hold that the manager does not. */
  hqIds: string[];
  zoneIds: string[];
  routeIds: string[];
}

/**
 * Used to list what a manager's team covered that the manager did not. Since 2026-11-26 a manager is based in one HQ and plans their
 * team's HQs through the team, so there is never a gap: the list is empty. Kept so older web clients get an answer.
 */
export class GetTerritoryGapsUseCase {
  async all(): Promise<TerritoryGap[]> {
    return [];
  }

  async forManager(_managerId: string): Promise<TerritoryGap | null> {
    return null;
  }
}
