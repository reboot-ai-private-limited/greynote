import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerCoverageRepositoryPort } from '../../domain/managerCoverage.repository.port.js';
import type { ManagerDirectoryPort } from '../../domain/managerDirectory.port.js';

/** The NSM covers every HQ; nobody records a coverage for the top. */
const COVERS_EVERYWHERE = 'NSM';
const LIMIT = 50;
const RANK = { covers: 0, none: 1, missing: 2 } as const;

export interface ManagerCandidate {
  id: string;
  employeeCode: string;
  name: string;
  designation: { id: string | null; name: string; level: number };
  /**
   * `covers`: their coverage includes the employee's HQ (or they are the NSM); `none`: no coverage recorded yet, so listed unfiltered;
   * `missing`: they have a coverage that leaves the employee's HQ out, listed last so choosing them can offer to add it.
   */
  coverage: 'covers' | 'none' | 'missing';
}

/**
 * Who can be chosen as an employee's reporting manager: active field employees at a higher designation (levels may be skipped), who cover
 * the employee's HQ — by HQ or by its Zone — first. A manager with no coverage recorded is still listed, marked `none`, and one whose coverage leaves
 * the HQ out is listed last, marked `missing`, so the picker can offer to add the HQ to their territory instead of hiding them. Without an HQ nothing is filtered by territory. Nearest level first, those who surely cover the HQ before those without a coverage.
 */
export class ListManagerCandidatesUseCase {
  constructor(
    private readonly users: ManagerDirectoryPort,
    private readonly coverage: ManagerCoverageRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(input: { belowLevel: number; hqId?: string | undefined; search?: string | undefined; excludeUserId?: string | undefined }): Promise<ManagerCandidate[]> {
    const term = input.search?.trim().toLowerCase();
    const all = (await this.users.listFieldEmployees()).filter(
      (u): u is typeof u & { designationLevel: number; designation: string } =>
        u.designationLevel !== null && u.designation !== null && u.designationLevel > input.belowLevel && u.id !== input.excludeUserId,
    );
    const named = term ? all.filter((u) => u.name.toLowerCase().includes(term) || u.employeeCode.toLowerCase().includes(term)) : all;
    const hq = input.hqId ? await this.hqs.findById(input.hqId) : null;
    const coverages = new Map((await this.coverage.findMany(named.map((u) => u.id))).map((c) => [c.userId, c]));

    const out: ManagerCandidate[] = [];
    for (const u of named) {
      const c = coverages.get(u.id);
      let state: ManagerCandidate['coverage'] = 'none';
      if (u.designation === COVERS_EVERYWHERE) state = 'covers';
      else if (c && (c.hqIds.length > 0 || c.zoneIds.length > 0)) {
        state = hq && !c.hqIds.includes(hq.id) && !c.zoneIds.includes(hq.zoneId) ? 'missing' : 'covers';
      }
      out.push({ id: u.id, employeeCode: u.employeeCode, name: u.name, designation: { id: u.designationId, name: u.designation, level: u.designationLevel }, coverage: state });
    }
    return out.sort((a, b) => a.designation.level - b.designation.level || RANK[a.coverage] - RANK[b.coverage] || a.name.localeCompare(b.name)).slice(0, LIMIT);
  }
}
