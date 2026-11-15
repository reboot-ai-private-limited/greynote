import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerDirectoryPort } from '../../domain/managerDirectory.port.js';
import type { GetManagerCoverageUseCase, SetManagerCoverageUseCase } from './managerCoverage.usecase.js';

/** Designation levels (MR 1 … NSM 5): ASM and RSM may hold routes; a ZSM and the NSM hold Zones and no routes. */
const ZSM = 4;

export interface ExtendManagerTerritoryResult {
  hqIds: string[];
  zoneIds: string[];
}

/**
 * Adds to a manager's ownership when an employee is put under them: the Zones and HQs ticked by Admin/HR in the manager picker. Union only
 * — it never takes anything away and ignores what the manager already has. A ZSM or the NSM gets the Zone (the HQ only when they already
 * narrow to named HQs). An NSM with no Zones saved covers every Zone, so saving one limits their zone-specific holidays to the Zones listed.
 *
 * It no longer copies routes onto the manager (decision-log 2026-11-16): what a manager sees of routes is computed from their team and the
 * Zones/HQs they own, so a copy only went stale. `routeIds` is still accepted from older clients and ignored.
 */
export class ExtendManagerTerritoryUseCase {
  constructor(
    private readonly coverage: GetManagerCoverageUseCase,
    private readonly setCoverage: SetManagerCoverageUseCase,
    private readonly hqs: HqRepositoryPort,
    private readonly users: ManagerDirectoryPort,
  ) {}

  async execute(managerId: string, input: { hqIds: string[]; zoneIds: string[]; routeIds?: string[] }, actorId: string): Promise<ExtendManagerTerritoryResult> {
    const level = (await this.users.getDesignationLevels([managerId]))[0]?.level;
    if (!level) throw AppError.badRequest('That employee has no designation.', { field: 'userId' });
    const current = await this.coverage.execute(managerId);

    const named = await this.hqs.findByIds([...new Set(input.hqIds)]);
    const addZones = [...input.zoneIds, ...named.map((h) => h.zoneId)];
    // A ZSM or NSM with no HQs named covers every HQ of their Zones; naming one would narrow them to it.
    const addHqs = level >= ZSM && current.hqIds.length === 0 ? [] : named.map((h) => h.id);
    const hqIds = [...new Set([...current.hqIds, ...addHqs])];
    const zoneIds = [...new Set([...current.zoneIds, ...addZones])];
    if (hqIds.length !== current.hqIds.length || zoneIds.length !== current.zoneIds.length) {
      await this.setCoverage.execute(managerId, { hqIds, zoneIds }, actorId);
    }

    return { hqIds, zoneIds };
  }
}
