import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerCoverageRepositoryPort } from '../../domain/managerCoverage.repository.port.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';

export interface UserTerritory {
  hqIds: string[];
  zoneIds: string[];
}

/**
 * Every HQ and Zone an employee covers: what HR's holidays follow. A covered Zone brings all its HQs unless the employee's coverage names
 * some of that Zone's HQs (a narrowing), and a covered HQ brings its Zone. The employee's current HQ always counts, so an employee with no
 * coverage recorded behaves as before. `null` when they cover nothing (only the national holidays apply).
 */
export class GetUserTerritoryUseCase {
  constructor(
    private readonly coverage: ManagerCoverageRepositoryPort,
    private readonly userHqs: UserHqAssignmentRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(userId: string): Promise<UserTerritory | null> {
    const found = await this.coverage.find(userId);
    const active = await this.userHqs.findActive(userId);
    const named = new Set([...(found?.hqIds ?? []), ...(active ? [active.hqId] : [])]);
    const zoneIds = new Set(found?.zoneIds ?? []);
    const hqIds = new Set(named);

    const namedHqs = await this.hqs.findByIds([...named]);
    const zoneOf = new Map(namedHqs.map((h) => [h.id, h.zoneId]));
    for (const zoneId of zoneIds) {
      const narrowed = [...named].some((id) => zoneOf.get(id) === zoneId);
      if (narrowed) continue;
      const all = await this.hqs.list({ page: 1, pageSize: 1000, zoneId });
      for (const hq of all.items) hqIds.add(hq.id);
    }
    for (const hq of namedHqs) zoneIds.add(hq.zoneId);
    return hqIds.size === 0 && zoneIds.size === 0 ? null : { hqIds: [...hqIds], zoneIds: [...zoneIds] };
  }
}
