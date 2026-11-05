import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LateGrant, LateGrantsPublicContract } from '@/modules/lateGrants/lateGrants.public.js';
import type { DcrLatePort, DcrLateStatus } from '../application/dcrLate.port.js';
import type { DcrSubmitDeadline } from '../application/dcrSubmitDeadline.js';

/** A report past `DCR_SUBMIT_CUTOFF_DAY` is let through by a usable `DCR_SUBMIT` exception from the unified Late Grants store, spent once. */
export class LateGrantsDcrAdapter implements DcrLatePort {
  constructor(
    private readonly late: LateGrantsPublicContract,
    private readonly deadline: DcrSubmitDeadline,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(userId: string, reportDate: string): Promise<DcrLateStatus> {
    const deadline = await this.deadline.of(reportDate);
    if (!deadline || this.now() <= deadline) return { status: 'ON_TIME' };
    const grant = await this.late.gate.findUsable(userId, 'DCR_SUBMIT', reportDate);
    return grant ? { status: 'LATE_ALLOWED', grant } : { status: 'LATE', deadline };
  }

  consume(grant: LateGrant, dcrId: string, ctx: TransactionContext): Promise<void> {
    return this.late.gate.consume(grant, dcrId, ctx);
  }
}
