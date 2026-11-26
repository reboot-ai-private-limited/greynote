import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerDirectoryPort } from '../../domain/managerDirectory.port.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';

const LIMIT = 50;
const RANK = { covers: 0, none: 1, missing: 2 } as const;

export interface ManagerCandidate {
  id: string;
  employeeCode: string;
  name: string;
  designation: { id: string | null; name: string; level: number };
  /** `covers`: based in the employee's HQ, or in its Zone; `none`: elsewhere. Since 2026-11-26 never `missing` (a manager is based in one HQ and manages people anywhere). */
  coverage: 'covers' | 'none' | 'missing';
}

/**
 * Who can be chosen as an employee's reporting manager: active field employees at a higher designation (levels may be skipped). Nearest
 * level first; within a level, those based in the employee's HQ or its Zone first. Nobody is hidden for where they are based.
 */
export class ListManagerCandidatesUseCase {
  constructor(
    private readonly users: ManagerDirectoryPort,
    private readonly userHqs: UserHqAssignmentRepositoryPort,
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
    const baseOf = new Map((await this.userHqs.findActiveForUsers(named.map((u) => u.id))).map((a) => [a.userId, a.hqId]));
    const zoneOf = new Map((await this.hqs.findByIds([...new Set(baseOf.values())])).map((h) => [h.id, h.zoneId]));

    const out: ManagerCandidate[] = [];
    for (const u of named) {
      const base = baseOf.get(u.id);
      const state: ManagerCandidate['coverage'] = hq && base && (base === hq.id || zoneOf.get(base) === hq.zoneId) ? 'covers' : 'none';
      out.push({ id: u.id, employeeCode: u.employeeCode, name: u.name, designation: { id: u.designationId, name: u.designation, level: u.designationLevel }, coverage: state });
    }
    return out.sort((a, b) => a.designation.level - b.designation.level || RANK[a.coverage] - RANK[b.coverage] || a.name.localeCompare(b.name)).slice(0, LIMIT);
  }
}
