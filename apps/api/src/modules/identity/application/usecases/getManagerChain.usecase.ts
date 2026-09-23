import { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/** Reporting chains are at most a handful of levels (MR→ASM→RSM→ZSM→NSM); this is a corruption guard, not a real limit. */
const MAX_CHAIN_DEPTH = 50;

/**
 * Walks `EmployeeProfile.managerId` upward — every user in a real chain is FIELD by construction,
 * so always has a profile. Returns the Nearest Higher Manager first, then everyone above them, up
 * to the top (`managerId: null`) — an empty array for a user with no manager. The Approval
 * Workflow Engine (Phase 3) resolves both its Stage-1 approver (chain[0]) and its
 * read-only-visibility set (chain[1:]) from this.
 */
export class GetManagerChainUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
  ) {}

  async execute(userId: string): Promise<UserSummary[]> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();

    const profile = await this.employeeProfileRepository.findByUserId(userId);
    const chain: UserSummary[] = [];
    let currentManagerId = profile?.managerId ?? null;

    for (let depth = 0; currentManagerId && depth < MAX_CHAIN_DEPTH; depth += 1) {
      const manager = await this.userRepository.findById(currentManagerId);
      if (!manager) throw AppError.internal('INTERNAL', { reason: 'MANAGER_NOT_FOUND', managerId: currentManagerId });

      const role = await this.roleRepository.findById(manager.roleId);
      if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: manager.roleId });

      const managerProfile = await this.employeeProfileRepository.findByUserId(manager.id);
      chain.push(toUserSummary(manager, role.name, managerProfile));
      currentManagerId = managerProfile?.managerId ?? null;
    }

    if (currentManagerId) {
      throw AppError.internal('INTERNAL', { reason: 'MANAGER_CHAIN_TOO_DEEP', userId, maxDepth: MAX_CHAIN_DEPTH });
    }

    return chain;
  }
}
