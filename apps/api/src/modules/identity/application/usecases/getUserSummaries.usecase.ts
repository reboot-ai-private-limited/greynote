import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { buildUserSummaries } from './teamSummaries.js';

/** Batched `getUserSummary` for list screens (e.g. an approval queue's submitter names). Unknown ids are skipped. */
export class GetUserSummariesUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
  ) {}

  async execute(userIds: string[]): Promise<UserSummary[]> {
    const unique = [...new Set(userIds)];
    const summaries = await buildUserSummaries(unique, {
      users: this.userRepository,
      profiles: this.employeeProfileRepository,
      roles: this.roleRepository,
    });
    return [...summaries.values()];
  }
}
