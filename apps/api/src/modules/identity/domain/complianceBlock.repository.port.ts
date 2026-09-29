import type { ComplianceBlockEvent } from './complianceBlock.entity.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';

/** The user already has an open block. Thrown from inside a transaction, caught outside it. */
export class OpenBlockExistsError extends Error {
  constructor() {
    super('This user already has an open compliance block');
    this.name = 'OpenBlockExistsError';
  }
}

export interface ComplianceBlockRepositoryPort {
  findOpenByUserId(userId: string): Promise<ComplianceBlockEvent | null>;
  /** The `unblockedAt` of the user's most recently cleared block, or `null` if none was ever cleared. */
  findLastClearedAt(userId: string): Promise<Date | null>;
  /** Throws `OpenBlockExistsError` if the user already has an open block. */
  create(input: Omit<ComplianceBlockEvent, 'id'>, ctx?: TransactionContext): Promise<ComplianceBlockEvent>;
  close(id: string, unblockedBy: string, unblockedAt: Date, ctx?: TransactionContext): Promise<void>;
}
