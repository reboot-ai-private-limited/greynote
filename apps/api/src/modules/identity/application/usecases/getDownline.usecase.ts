import { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { buildUserSummaries, byName } from './teamSummaries.js';

/** A downline member and how far below the manager they sit: 1 = direct report. */
export type DownlineMember = UserSummary & { depth: number };

/**
 * Everyone below this manager, at any depth — computed live, never stored (HLD 05 §3). Depth 1
 * are the people this manager approves for; deeper members are read-only for them. Also what the
 * Team tab and Marketing's target rollup read. Sorted by depth, then name.
 */
export class GetDownlineUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
  ) {}

  async execute(managerId: string): Promise<DownlineMember[]> {
    if (!(await this.userRepository.findById(managerId))) throw AppError.notFound();

    const members = await this.employeeProfileRepository.findDownline(managerId);
    const summaries = await buildUserSummaries(
      members.map((m) => m.userId),
      { users: this.userRepository, profiles: this.employeeProfileRepository, roles: this.roleRepository },
    );

    return members
      .flatMap((m) => {
        const summary = summaries.get(m.userId);
        // A profile whose User row is gone is orphaned data — skip it rather than fail the whole team.
        return summary ? [{ ...summary, depth: m.depth }] : [];
      })
      .sort((a, b) => a.depth - b.depth || byName(a, b));
  }
}
