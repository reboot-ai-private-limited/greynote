import { AppError } from '@/shared/errors/AppError.js';
import { effectiveGrantStatus, type LateGrant } from '../../domain/lateGrant.entity.js';
import type { LateGrantRepositoryPort } from '../../domain/lateGrant.repository.port.js';
import type { Actor } from '../actor.js';

/** Take back an unused late-submission exception — Admin, or whoever granted it. */
export class RevokeLateUseCase {
  constructor(
    private readonly grants: LateGrantRepositoryPort,
    private readonly now: () => Date,
  ) {}

  async execute(actor: Actor, grantId: string): Promise<LateGrant> {
    const grant = await this.grants.findById(grantId);
    if (!grant) throw AppError.notFound('No such late-submission exception.');
    if (actor.role !== 'ADMIN' && grant.grantedBy !== actor.id) throw AppError.forbidden('Only Admin or whoever granted it can revoke this.');
    const now = this.now();
    if (effectiveGrantStatus(grant, now) !== 'OPEN') throw AppError.conflict('This exception is already used, revoked or expired.');
    const revoked = await this.grants.revoke(grant.id, actor.id, now);
    if (!revoked) throw AppError.conflict('This exception was used or revoked meanwhile.');
    return revoked;
  }
}
