import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';

export interface UserTerritory {
  hqIds: string[];
  zoneIds: string[];
}

/**
 * Where an employee is based, for HR's holidays: their one main HQ and its Zone (decision-log 2026-11-26: one HQ for every designation; a
 * manager's old multi-HQ coverage no longer counts). `null` with no HQ set: only the national holidays apply.
 */
export class GetUserTerritoryUseCase {
  constructor(
    private readonly userHqs: UserHqAssignmentRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(userId: string): Promise<UserTerritory | null> {
    const active = await this.userHqs.findActive(userId);
    const hq = active ? await this.hqs.findById(active.hqId) : null;
    return hq ? { hqIds: [hq.id], zoneIds: [hq.zoneId] } : null;
  }
}
