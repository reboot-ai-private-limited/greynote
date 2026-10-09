import { buildPaginatedResult, type PaginatedResult, type PaginationQuery } from '@/shared/http/pagination.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type UserSummary } from '../../domain/user.entity.js';

/** A row of the employee list: the summary plus what the table shows without a second request. */
export type UserListItem = UserSummary & { managerName: string | null; hqId: string | null; zoneId: string | null };
import type {
  UserListFilters,
  UserRepositoryPort,
} from '../../domain/user.repository.port.js';

export class ListUsersUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
  ) {}

  async execute(
    pagination: PaginationQuery,
    filters: UserListFilters,
  ): Promise<PaginatedResult<UserListItem>> {
    const { items, total } = await this.userRepository.list(pagination, filters);

    // Resolve each item's role name once per distinct roleId, not once per user.
    const roleIds = [...new Set(items.map((u) => u.roleId))];
    const roles = await Promise.all(roleIds.map((id) => this.roleRepository.findById(id)));
    const roleNameById = new Map(roles.filter((r) => r !== null).map((r) => [r.id, r.name]));

    // One batched query for the whole page's profiles, not one per user.
    const profiles = await this.employeeProfileRepository.findByUserIds(items.map((u) => u.id));
    const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

    // The managers' names, in one query for the page.
    const managerIds = [...new Set(profiles.map((p) => p.managerId).filter((id): id is string => id !== null))];
    const managerNameById = new Map((await this.userRepository.findByIds(managerIds)).map((m) => [m.id, m.name]));

    const summaries = items.map((user) => {
      const roleName = roleNameById.get(user.roleId);
      if (!roleName) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });
      const profile = profileByUserId.get(user.id) ?? null;
      return {
        ...toUserSummary(user, roleName, profile),
        managerName: (profile?.managerId && managerNameById.get(profile.managerId)) || null,
        hqId: profile?.hqId ?? null,
        zoneId: profile?.zoneId ?? null,
      };
    });

    return buildPaginatedResult(summaries, total, pagination);
  }
}
