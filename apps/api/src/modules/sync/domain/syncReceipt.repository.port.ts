import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SyncReceipt } from './syncReceipt.entity.js';

/** Another request wrote this record's receipt first. Thrown from inside a transaction, caught outside it. */
export class DuplicateReceiptError extends Error {
  constructor() {
    super('This record was already synced');
    this.name = 'DuplicateReceiptError';
  }
}

export interface SyncReceiptRepositoryPort {
  /** The receipts this user already has among these client ids. */
  findByClientIds(userId: string, clientIds: string[]): Promise<SyncReceipt[]>;
  /** Throws `DuplicateReceiptError` if `(userId, clientId)` already has one. */
  create(receipt: SyncReceipt, ctx: TransactionContext): Promise<void>;
}
