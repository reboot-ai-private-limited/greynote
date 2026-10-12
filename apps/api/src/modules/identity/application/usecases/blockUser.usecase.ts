import { AppError } from '@/shared/errors/AppError.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { OpenBlockExistsError, type ComplianceBlockRepositoryPort } from '../../domain/complianceBlock.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * The trigger side of the compliance block (HLD 10): the missed-DCR job (Field Activity) calls this for a
 * field employee who has exceeded the grace with no covering Leave. It records the event and flips
 * `User.isBlocked` in one transaction — the mirror of `UnblockUserUseCase`, which closes both.
 *
 * Only an active FIELD employee can be blocked (the block stops *field* submissions; Admin, HR and
 * Accountant have none). **Idempotent**: blocking someone already blocked changes nothing and answers
 * `false`, so the daily job can be run twice, or race an Admin, without doubling a block — the database
 * allows only one open block per user, and the loser of a race is reported as already blocked.
 */
export class BlockUserUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly roles: RoleRepositoryPort,
    private readonly blocks: ComplianceBlockRepositoryPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** `true` if this call blocked them, `false` if they were already blocked. */
  async execute(userId: string, reason: string): Promise<boolean> {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound();
    const role = await this.roles.findById(user.roleId);
    if (role?.name !== 'FIELD') throw AppError.badRequest('Only field employees can be blocked.', { field: 'userId' });
    if (user.status !== 'active') throw AppError.conflict('Only an active employee can be blocked.', { field: 'userId' });
    if (user.isBlocked) return false;

    try {
      await this.transactions.run(async (ctx) => {
        await this.blocks.create({ userId, reason, blockedAt: this.now(), unblockedBy: null, unblockedAt: null, unblockedByRole: null, unblockReason: null }, ctx);
        await this.users.update(userId, { isBlocked: true }, ctx);
      });
      return true;
    } catch (err) {
      if (err instanceof OpenBlockExistsError) return false; // a simultaneous run blocked them first
      throw err;
    }
  }
}
