import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { appEvents } from '@/shared/events/appEvents.js';
import type { ComplianceBlockRepositoryPort } from '../../domain/complianceBlock.repository.port.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * Clears a compliance block. Admin can clear anyone's; a manager can clear the block of anyone below them in the reporting
 * chain (decision-log 2026-10-12 — this replaces the earlier "Admin only" rule). Either way a reason is required and is kept,
 * with who cleared it and in what role, on the block event: that record is the audit trail.
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
    /** The managers above an employee, nearest first. */
    private readonly managerChain: (userId: string) => Promise<Array<{ id: string }>>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actingUserId: string, actingRole: RoleName, targetUserId: string, reason: string): Promise<void> {
    const why = reason.trim();
    if (!why) throw AppError.badRequest('A reason is required to unblock someone.', { field: 'reason' });

    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw AppError.notFound();
    await this.assertMayClear(actingUserId, actingRole, targetUserId);
    if (!user.isBlocked) return; // already unblocked — idempotent no-op

    await this.transactionRunner.run(async (ctx) => {
      const openBlock = await this.complianceBlockRepository.findOpenByUserId(targetUserId);
      // Defensive: `isBlocked: true` should always have a matching open ComplianceBlock. If it
      // doesn't (data drift from before this pass), still clear the flag rather than leaving the
      // user stuck blocked with no way to resolve it.
      if (openBlock) {
        await this.complianceBlockRepository.close(
          openBlock.id,
          { unblockedBy: actingUserId, unblockedByRole: actingRole, unblockReason: why, unblockedAt: this.now() },
          ctx,
        );
      }
      await this.userRepository.update(targetUserId, { isBlocked: false }, ctx);
    });
    appEvents.emit('user.unblocked', { userId: targetUserId, by: actingUserId });
  }

  private async assertMayClear(actingUserId: string, actingRole: RoleName, targetUserId: string): Promise<void> {
    if (actingRole === 'ADMIN') return;
    if (actingRole !== 'FIELD' || actingUserId === targetUserId) throw AppError.forbidden();
    const chain = await this.managerChain(targetUserId);
    // Someone outside the chain isn't told the employee exists.
    if (!chain.some((m) => m.id === actingUserId)) throw AppError.notFound();
  }
}
