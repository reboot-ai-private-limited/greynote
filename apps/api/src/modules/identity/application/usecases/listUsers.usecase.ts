import { buildPaginatedResult, type PaginatedResult, type PaginationQuery } from '@/shared/http/pagination.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type UserSummary } from '../../domain/user.entity.js';
import type {
  UserListFilters,
  UserRepositoryPort,
} from '../../domain/user.repository.port.js';

export class ListUsersUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
  ) {}

  async execute(
    pagination: PaginationQuery,
    filters: UserListFilters,
  ): Promise<PaginatedResult<UserSummary>> {
    const { items, total } = await this.userRepository.list(pagination, filters);

    // Resolve each item's role name once per distinct roleId, not once per user.
    const roleIds = [...new Set(items.map((u) => u.roleId))];
    const roles = await Promise.all(roleIds.map((id) => this.roleRepository.findById(id)));
    const roleNameById = new Map(roles.filter((r) => r !== null).map((r) => [r.id, r.name]));

    const summaries = items.map((user) => {
      const roleName = roleNameById.get(user.roleId);
      if (!roleName) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });
      return toUserSummary(user, roleName);
    });

    return buildPaginatedResult(summaries, total, pagination);
  }
}
