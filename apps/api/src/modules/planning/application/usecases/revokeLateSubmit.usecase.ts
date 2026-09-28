import { AppError } from '@/shared/errors/AppError.js';
import { effectiveGrantStatus, type LateSubmitGrant } from '../../domain/lateSubmitGrant.entity.js';
import type { LateSubmitGrantRepositoryPort } from '../../domain/lateSubmitGrant.repository.port.js';
import type { Actor } from '../planAccess.js';

/** Take back an unused late-submission exception — Admin, or whoever granted it. */
export class RevokeLateSubmitUseCase {
  constructor(
    private readonly grants: LateSubmitGrantRepositoryPort,
    private readonly now: () => Date,
  ) {}

  async execute(actor: Actor, grantId: string): Promise<LateSubmitGrant> {
    const grant = await this.grants.findById(grantId);
    if (!grant) throw AppError.notFound('No such late-submission exception.');
    if (actor.role !== 'ADMIN' && grant.grantedBy !== actor.id) {
      throw AppError.forbidden('Only Admin or whoever granted it can revoke this.');
    }
    const now = this.now();
    if (effectiveGrantStatus(grant, now) !== 'OPEN') {
      throw AppError.conflict('This exception is already used, revoked or expired.');
    }
    const revoked = await this.grants.revoke(grant.id, actor.id, now);
    if (!revoked) throw AppError.conflict('This exception was used or revoked meanwhile.');
    return revoked;
  }
}
