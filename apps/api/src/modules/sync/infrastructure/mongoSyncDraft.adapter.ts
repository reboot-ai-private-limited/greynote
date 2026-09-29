import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SyncDraft } from '../domain/syncDraft.entity.js';
import type { SyncDraftRepositoryPort } from '../domain/syncDraft.repository.port.js';
import { SyncDraftModel } from './syncDraft.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

export class MongoSyncDraftAdapter implements SyncDraftRepositoryPort {
  async putIfNewer(draft: SyncDraft, expiresAt: Date): Promise<boolean> {
    const key = { userId: oid(draft.userId), clientId: draft.clientId };
    try {
      // Matches only a held copy that is OLDER than this one. With none held, the upsert inserts; with a
      // newer-or-equal one held, the filter misses, the upsert tries to insert, and the unique index
      // refuses — which is exactly "stale", decided atomically by the database.
      await SyncDraftModel.updateOne(
        { ...key, clientUpdatedAt: { $lt: draft.clientUpdatedAt } },
        {
          $set: {
            kind: draft.kind,
            clientUpdatedAt: draft.clientUpdatedAt,
            payload: draft.deleted ? null : draft.payload,
            deleted: draft.deleted,
            updatedAt: new Date(),
            expiresAt,
          },
          $setOnInsert: key,
        },
        { upsert: true },
      );
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }

  async findExistingIds(userId: string, clientIds: string[]): Promise<Set<string>> {
    if (clientIds.length === 0) return new Set();
    const docs = await SyncDraftModel.find({ userId: oid(userId), clientId: { $in: clientIds } }, { clientId: 1 }).lean();
    return new Set(docs.map((d) => d.clientId));
  }

  async countLive(userId: string): Promise<number> {
    return SyncDraftModel.countDocuments({ userId: oid(userId), deleted: false });
  }

  async listLive(userId: string, afterId: string | null, limit: number): Promise<Array<SyncDraft & { id: string }>> {
    const docs = await SyncDraftModel.find({
      userId: oid(userId),
      deleted: false,
      ...(afterId !== null && { _id: { $gt: oid(afterId) } }),
    })
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean();
    return docs.map((d) => ({
      id: String(d._id),
      userId: String(d.userId),
      clientId: d.clientId,
      kind: d.kind,
      clientUpdatedAt: d.clientUpdatedAt,
      payload: d.payload,
      deleted: d.deleted,
    }));
  }

  async deleteForRecord(userId: string, clientId: string, ctx: TransactionContext): Promise<void> {
    await SyncDraftModel.deleteOne({ userId: oid(userId), clientId }, { session: ctx as ClientSession });
  }
}
