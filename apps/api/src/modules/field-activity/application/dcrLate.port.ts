import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LateGrant } from '@/modules/lateGrants/lateGrants.public.js';

/** Where a day's report stands against its monthly cutoff (`DCR_SUBMIT_CUTOFF_DAY`). */
export type DcrLateStatus =
  | { status: 'ON_TIME' }
  | { status: 'LATE_ALLOWED'; grant: LateGrant }
  | { status: 'LATE'; deadline: Date };

/** The late-submission exception of a daily report: only Admin grants it, and the final submit spends it. */
export interface DcrLatePort {
  check(userId: string, reportDate: string): Promise<DcrLateStatus>;
  consume(grant: LateGrant, dcrId: string, ctx: TransactionContext): Promise<void>;
}
