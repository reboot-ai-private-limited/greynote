import { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * Summaries for a whole team in three queries (users, profiles, roles) rather than three per
 * member — a top manager's downline can be the entire field force.
 */
export async function buildUserSummaries(
  userIds: string[],
  repos: {
    users: UserRepositoryPort;
    profiles: EmployeeProfileRepositoryPort;
    roles: RoleRepositoryPort;
  },
): Promise<Map<string, UserSummary>> {
  const [users, profiles, roles] = await Promise.all([
    repos.users.findByIds(userIds),
    repos.profiles.findByUserIds(userIds),
    repos.roles.list(),
  ]);
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));

  const summaries = new Map<string, UserSummary>();
  for (const user of users) {
    const role = roleName.get(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });
    summaries.set(user.id, toUserSummary(user, role, profileByUser.get(user.id) ?? null));
  }
  return summaries;
}

export const byName = (a: UserSummary, b: UserSummary) => a.name.localeCompare(b.name);
