import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerDirectoryPort } from '../../domain/managerDirectory.port.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { GetManagerCoverageUseCase } from './managerCoverage.usecase.js';

/** ASM and RSM may hold routes; a ZSM and the NSM hold Zones (and HQs only when they narrow to named ones). */
const ASM = 2;
const RSM = 3;
const ZSM = 4;

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

interface Held {
  hqIds: string[];
  zoneIds: string[];
  routeIds: string[];
}

/**
 * What a manager's direct reports cover or hold that the manager does not — the people placed under a manager before choosing one could
 * extend their territory. Direct reports only (an RSM's are ASMs, an ASM's are MRs); the whole tree is fixed level by level. Read only:
 * applying a gap is `ExtendManagerTerritoryUseCase`, union only. Routes count for an ASM or RSM; a ZSM or the NSM gets Zones (and HQs only
 * when they already narrow to named ones).
 */
export class GetTerritoryGapsUseCase {
  constructor(
    private readonly users: ManagerDirectoryPort,
    private readonly coverage: GetManagerCoverageUseCase,
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  /** Every manager with at least one gap, by name. */
  async all(): Promise<TerritoryGap[]> {
    const people = await this.users.listFieldEmployees();
    const byManager = new Map<string, typeof people>();
    for (const p of people) if (p.managerId) byManager.set(p.managerId, [...(byManager.get(p.managerId) ?? []), p]);
    const out: TerritoryGap[] = [];
    for (const manager of people) {
      const reports = byManager.get(manager.id);
      if (!reports || manager.designationLevel === null) continue;
      const gap = await this.gapOf(manager, reports.map((r) => r.id));
      if (gap.hqIds.length + gap.zoneIds.length + gap.routeIds.length > 0) out.push(gap);
    }
    return out.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  }

  /** One manager's gap (empty when they have no reports or nothing is missing). */
  async forManager(managerId: string): Promise<TerritoryGap | null> {
    const people = await this.users.listFieldEmployees();
    const manager = people.find((p) => p.id === managerId);
    if (!manager || manager.designationLevel === null) return null;
    return this.gapOf(manager, people.filter((p) => p.managerId === managerId).map((p) => p.id));
  }

  private async gapOf(manager: { id: string; employeeCode: string; name: string; designation: string | null; designationLevel: number | null }, reportIds: string[]): Promise<TerritoryGap> {
    const level = manager.designationLevel as number;
    const mine = await this.held(manager.id);
    const theirs: Held = { hqIds: [], zoneIds: [], routeIds: [] };
    for (const id of reportIds) {
      const h = await this.held(id);
      theirs.hqIds.push(...h.hqIds);
      theirs.zoneIds.push(...h.zoneIds);
      theirs.routeIds.push(...h.routeIds);
    }
    const hqById = new Map((await this.hqs.findByIds([...new Set([...mine.hqIds, ...theirs.hqIds])])).map((h) => [h.id, h]));
    const mineZoneOfHq = new Set(mine.hqIds.map((id) => hqById.get(id)?.zoneId));
    // A covered HQ: named, or in a covered Zone the manager does not narrow to some of its HQs.
    const covers = (hqId: string) => {
      if (mine.hqIds.includes(hqId)) return true;
      const zoneId = hqById.get(hqId)?.zoneId;
      return zoneId !== undefined && mine.zoneIds.includes(zoneId) && !mineZoneOfHq.has(zoneId);
    };
    const hqIds = level >= ZSM && mine.hqIds.length === 0 ? [] : [...new Set(theirs.hqIds)].filter((id) => !covers(id));
    const zoneIds = [...new Set(theirs.zoneIds)].filter((z) => !mine.zoneIds.includes(z));
    const routeIds = level === ASM || level === RSM ? [...new Set(theirs.routeIds)].filter((id) => !mine.routeIds.includes(id)) : [];
    return { managerId: manager.id, employeeCode: manager.employeeCode, name: manager.name, designation: manager.designation, level, reports: reportIds.length, hqIds, zoneIds, routeIds };
  }

  /** The HQs and Zones someone covers and the active routes they hold. */
  private async held(userId: string): Promise<Held> {
    const [cov, rows] = await Promise.all([this.coverage.execute(userId), this.assignments.listActiveForUser(userId)]);
    const routes = (await this.routes.findByIds(rows.map((r) => r.routeId))).filter((r) => r.status === 'active');
    return { hqIds: cov.hqIds, zoneIds: cov.zoneIds, routeIds: routes.map((r) => r.id) };
  }
}
