import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { ComplianceBlockRepositoryPort } from '../../domain/complianceBlock.repository.port.js';
import type { TransactionRunnerPort } from '../../domain/transactionRunner.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * Admin-only to clear a compliance block — deliberately never the target's Nearest Higher
 * Manager, even though that manager is otherwise the Stage-1 approver for everything else this
 * user submits (ERD-01's explicit carve-out: the block is punitive/compliance-driven, not a
 * routine approval).
 *
 * Closing the open `ComplianceBlock` and flipping `User.isBlocked` are two collections, two
 * writes — this codebase's first transactional path, since either happening without the other
 * would leave the block state and its own history disagreeing with each other.
 */
export class UnblockUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly complianceBlockRepository: ComplianceBlockRepositoryPort,
    private readonly transactionRunner: TransactionRunnerPort,
  ) {}

  async execute(actingUserId: string, actingRole: RoleName, targetUserId: string): Promise<void> {
    if (actingRole !== 'ADMIN') throw AppError.forbidden();

    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw AppError.notFound();
    if (!user.isBlocked) return; // already unblocked — idempotent no-op

    await this.transactionRunner.run(async (ctx) => {
      const openBlock = await this.complianceBlockRepository.findOpenByUserId(targetUserId);
      // Defensive: `isBlocked: true` should always have a matching open ComplianceBlock. If it
      // doesn't (data drift from before this pass), still clear the flag rather than leaving the
      // user stuck blocked with no way to resolve it.
      if (openBlock) {
        await this.complianceBlockRepository.close(openBlock.id, actingUserId, new Date(), ctx);
      }
      await this.userRepository.update(targetUserId, { isBlocked: false }, ctx);
    });
  }
}
