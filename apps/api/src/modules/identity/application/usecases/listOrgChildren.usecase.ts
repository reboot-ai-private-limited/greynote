import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { buildUserSummaries } from './teamSummaries.js';

export type OrgNode = UserSummary & { hqId: string | null; directCount: number };

/**
 * One level of the organisation tree: the people directly under `parentId`, or the people with no manager when it is
 * left out. Paged and counted per level, so the tree stays light however large the company is.
 */
export class ListOrgChildrenUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
  ) {}

  async execute(parentId: string | null, paging: { page: number; pageSize: number }): Promise<PaginatedResult<OrgNode>> {
    const { items, total } = await this.employeeProfileRepository.findChildrenPage(parentId, toSkipLimit(paging));
    const ids = items.map((i) => i.userId);
    const [summaries, profiles] = await Promise.all([
      buildUserSummaries(ids, { users: this.userRepository, profiles: this.employeeProfileRepository, roles: this.roleRepository }),
      this.employeeProfileRepository.findByUserIds(ids),
    ]);
    const hqOf = new Map(profiles.map((p) => [p.userId, p.hqId]));
    const nodes = items.flatMap((i) => {
      const summary = summaries.get(i.userId);
      // A profile whose User row is gone is orphaned data: skip it rather than fail the level.
      return summary ? [{ ...summary, hqId: hqOf.get(i.userId) ?? null, directCount: i.directCount }] : [];
    });
    return buildPaginatedResult(nodes, total, paging);
  }
}
