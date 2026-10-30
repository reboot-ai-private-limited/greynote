import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerDirectoryPort } from '../../domain/managerDirectory.port.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { AssignRouteUseCase } from './assignRoute.usecase.js';
import type { GetManagerCoverageUseCase, SetManagerCoverageUseCase } from './managerCoverage.usecase.js';

/** Designation levels (MR 1 … NSM 5): ASM and RSM may hold routes; a ZSM and the NSM hold Zones and no routes. */
const ZSM = 4;

export interface ExtendManagerTerritoryResult {
  hqIds: string[];
  zoneIds: string[];
  routesAdded: number;
}

/**
 * Adds to a manager's territory when an employee is put under them: the Zones and HQs, and the routes, ticked by Admin/HR in the manager
 * picker. Union only — it never takes anything away and ignores what the manager already has. Routes follow the designation rules (ASM
 * and RSM hold them; a ZSM or the NSM does not); a ZSM or the NSM gets the Zone (the HQ only when they already narrow to named HQs). An NSM with
 * no Zones saved covers every Zone, so saving one limits their zone-specific holidays to the Zones listed.
 */
export class ExtendManagerTerritoryUseCase {
  constructor(
    private readonly coverage: GetManagerCoverageUseCase,
    private readonly setCoverage: SetManagerCoverageUseCase,
    private readonly hqs: HqRepositoryPort,
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly assignRoute: AssignRouteUseCase,
    private readonly users: ManagerDirectoryPort,
  ) {}

  async execute(managerId: string, input: { hqIds: string[]; zoneIds: string[]; routeIds: string[] }, actorId: string): Promise<ExtendManagerTerritoryResult> {
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

    let routesAdded = 0;
    if (level < ZSM) {
      for (const routeId of new Set(input.routeIds)) {
        if (await this.assignments.findActive(routeId, managerId)) continue;
        await this.assignRoute.execute(routeId, managerId, actorId);
        routesAdded += 1;
      }
    }
    return { hqIds, zoneIds, routesAdded };
  }
}
