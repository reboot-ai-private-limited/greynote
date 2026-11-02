import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { LateGrant, LateGrantKind } from '../domain/lateGrant.entity.js';
import type { LateGrantRepositoryPort } from '../domain/lateGrant.repository.port.js';
import type { PeriodLocks } from './periodLocks.js';

/**
 * What the modules that enforce a deadline use: is there a usable exception for this, and spend it. Spending re-checks the period
 * locks — the state can change between granting and using — and closes the grant instead of letting a settled period be touched.
 */
export class LateGrantGate {
  constructor(
    private readonly grants: LateGrantRepositoryPort,
    private readonly locks: PeriodLocks,
    private readonly now: () => Date,
  ) {}

  /** The usable exception, or `null`. A period locked since the grant was made counts as none. */
  async findUsable(userId: string, kind: LateGrantKind, periodKey: string): Promise<LateGrant | null> {
    const grant = await this.grants.findUsable(userId, kind, periodKey, this.now());
    if (!grant) return null;
    return (await this.locks.reason(userId, kind, periodKey)) ? null : grant;
  }

  /** Inside the caller's transaction: spend it. Throws if it was used, revoked or expired meanwhile. */
  async consume(grant: LateGrant, usedRef: string | null, ctx?: TransactionContext): Promise<void> {
    await this.locks.assertOpen(grant.userId, grant.kind, grant.periodKey);
    if (!(await this.grants.consume(grant.id, this.now(), usedRef, ctx))) {
      throw AppError.conflict('The late-submission exception was used, revoked or expired meanwhile.');
    }
  }

  /** A settled period (payroll finalized, expenses paid) ends every exception still open for it. */
  closeForPeriod(userId: string, kinds: LateGrantKind[], periodPrefix: string): Promise<number> {
    return this.grants.closeOpenForPeriod(userId, kinds, periodPrefix, this.now());
  }
}
