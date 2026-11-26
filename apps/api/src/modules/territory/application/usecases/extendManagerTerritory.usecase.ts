import type { GetManagerCoverageUseCase } from './managerCoverage.usecase.js';

export interface ExtendManagerTerritoryResult {
  hqIds: string[];
  zoneIds: string[];
}

/**
 * Used to add a team's HQs and Zones to their manager's coverage when someone was put under them. Since 2026-11-26 every employee is based
 * in exactly one HQ, and a manager plans their team's HQs through the team itself, so there is nothing to add: this changes nothing and
 * answers where the manager is based. Kept so older web clients that still call it get a 200.
 */
export class ExtendManagerTerritoryUseCase {
  constructor(private readonly coverage: GetManagerCoverageUseCase) {}

  async execute(managerId: string, _input: { hqIds: string[]; zoneIds: string[]; routeIds?: string[] }, _actorId: string): Promise<ExtendManagerTerritoryResult> {
    const { hqIds, zoneIds } = await this.coverage.execute(managerId);
    return { hqIds, zoneIds };
  }
}
