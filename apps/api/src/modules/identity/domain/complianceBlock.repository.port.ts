import type { ComplianceBlockEvent } from './complianceBlock.entity.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';

/** The user already has an open block. Thrown from inside a transaction, caught outside it. */
export class OpenBlockExistsError extends Error {
  constructor() {
    super('This user already has an open compliance block');
    this.name = 'OpenBlockExistsError';
  }
}

/** How a block was cleared. */
export interface BlockClearing {
  unblockedBy: string;
  unblockedByRole: string;
  unblockReason: string;
  unblockedAt: Date;
}

export interface ComplianceBlockRepositoryPort {
  findOpenByUserId(userId: string): Promise<ComplianceBlockEvent | null>;
  /** The `unblockedAt` of the user's most recently cleared block, or `null` if none was ever cleared. */
  findLastClearedAt(userId: string): Promise<Date | null>;
  /** Throws `OpenBlockExistsError` if the user already has an open block. */
  create(input: Omit<ComplianceBlockEvent, 'id'>, ctx?: TransactionContext): Promise<ComplianceBlockEvent>;
  close(id: string, clearing: BlockClearing, ctx?: TransactionContext): Promise<void>;
  /** Every block event on the user, newest first — the audit trail. */
  listByUserId(userId: string): Promise<ComplianceBlockEvent[]>;
}
