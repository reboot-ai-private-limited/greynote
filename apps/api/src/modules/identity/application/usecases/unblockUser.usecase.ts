import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * Admin-only to clear a compliance block — deliberately never the target's Nearest Higher
 * Manager, even though that manager is otherwise the Stage-1 approver for everything else this
 * user submits (ERD-01's explicit carve-out: the block is punitive/compliance-driven, not a
 * routine approval).
 */
export class UnblockUserUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(actingUserId: string, actingRole: RoleName, targetUserId: string): Promise<void> {
    if (actingRole !== 'ADMIN') throw AppError.forbidden();

    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw AppError.notFound();

    await this.userRepository.update(targetUserId, {
      isBlocked: false,
      unblockedBy: actingUserId,
      unblockedAt: new Date(),
    });
  }
}
