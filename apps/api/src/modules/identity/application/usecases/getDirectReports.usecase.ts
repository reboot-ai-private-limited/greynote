import { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { buildUserSummaries, byName } from './teamSummaries.js';

/**
 * Everyone whose `managerId` is this user, sorted by name — the people whose submissions this
 * manager approves at Stage 1 (HLD 05). Includes inactive and pending users; callers filter.
 */
export class GetDirectReportsUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
  ) {}

  async execute(managerId: string): Promise<UserSummary[]> {
    if (!(await this.userRepository.findById(managerId))) throw AppError.notFound();

    const ids = await this.employeeProfileRepository.findUserIdsByFilter({ managerId });
    const summaries = await buildUserSummaries(ids, {
      users: this.userRepository,
      profiles: this.employeeProfileRepository,
      roles: this.roleRepository,
    });
    return [...summaries.values()].sort(byName);
  }
}
