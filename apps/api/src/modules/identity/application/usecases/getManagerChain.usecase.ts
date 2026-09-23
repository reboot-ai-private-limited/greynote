import { AppError } from '@/shared/errors/AppError.js';
import type { UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary } from '../../domain/user.entity.js';

/** Reporting chains are at most a handful of levels (MR→ASM→RSM→ZSM→NSM); this is a corruption guard, not a real limit. */
const MAX_CHAIN_DEPTH = 50;

/**
 * Walks `managerId` upward. Returns the Nearest Higher Manager first, then everyone above them,
 * up to the top (`managerId: null`) — an empty array for a user with no manager. The Approval
 * Workflow Engine (Phase 3) resolves both its Stage-1 approver (chain[0]) and its
 * read-only-visibility set (chain[1:]) from this.
 */
export class GetManagerChainUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
  ) {}

  async execute(userId: string): Promise<UserSummary[]> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();

    const chain: UserSummary[] = [];
    let currentManagerId = user.managerId;

    for (let depth = 0; currentManagerId && depth < MAX_CHAIN_DEPTH; depth += 1) {
      const manager = await this.userRepository.findById(currentManagerId);
      if (!manager) throw AppError.internal('INTERNAL', { reason: 'MANAGER_NOT_FOUND', managerId: currentManagerId });

      const role = await this.roleRepository.findById(manager.roleId);
      if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: manager.roleId });

      chain.push(toUserSummary(manager, role.name));
      currentManagerId = manager.managerId;
    }

    if (currentManagerId) {
      throw AppError.internal('INTERNAL', { reason: 'MANAGER_CHAIN_TOO_DEEP', userId, maxDepth: MAX_CHAIN_DEPTH });
    }

    return chain;
  }
}
