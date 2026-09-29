import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SyncReceipt } from '../domain/syncReceipt.entity.js';
import { DuplicateReceiptError, type SyncReceiptRepositoryPort } from '../domain/syncReceipt.repository.port.js';
import { SyncReceiptModel } from './syncReceipt.schema.js';

export class MongoSyncReceiptAdapter implements SyncReceiptRepositoryPort {
  async findByClientIds(userId: string, clientIds: string[]): Promise<SyncReceipt[]> {
    if (clientIds.length === 0) return [];
    const docs = await SyncReceiptModel.find({ userId: new Types.ObjectId(userId), clientId: { $in: clientIds } }).lean();
    return docs.map((d) => ({ userId: String(d.userId), clientId: d.clientId, kind: d.kind, serverId: d.serverId, ...(d.data !== undefined && { data: d.data }), syncedAt: d.syncedAt }));
  }

  async create(receipt: SyncReceipt, ctx: TransactionContext): Promise<void> {
    try {
      await SyncReceiptModel.create([{ ...receipt, userId: new Types.ObjectId(receipt.userId) }], { session: ctx as ClientSession });
    } catch (err) {
      // The database aborts the transaction on this, so it is thrown for the use case to answer.
      if ((err as { code?: number }).code === 11000) throw new DuplicateReceiptError();
      throw err;
    }
  }
}
