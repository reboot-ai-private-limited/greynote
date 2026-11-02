import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LateGrant, LateGrantKind, NewLateGrant } from '../domain/lateGrant.entity.js';
import type { LateGrantFilter, LateGrantRepositoryPort } from '../domain/lateGrant.repository.port.js';
import { LateGrantModel, type LateGrantDoc } from './lateGrant.schema.js';

function toGrant(doc: LateGrantDoc & { _id: unknown }): LateGrant {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    kind: doc.kind,
    periodKey: doc.periodKey,
    reason: doc.reason,
    grantedBy: String(doc.grantedBy),
    grantedByRole: doc.grantedByRole,
    grantedAt: doc.grantedAt,
    expiresAt: doc.expiresAt,
    status: doc.status,
    usedAt: doc.usedAt,
    usedRef: doc.usedRef ?? null,
    revokedAt: doc.revokedAt,
    revokedBy: doc.revokedBy === null ? null : String(doc.revokedBy),
  };
}

const usable = (now: Date) => ({ status: 'OPEN', expiresAt: { $gt: now } });
const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class MongoLateGrantAdapter implements LateGrantRepositoryPort {
  async findById(id: string): Promise<LateGrant | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LateGrantModel.findById(id).lean();
    return doc ? toGrant(doc) : null;
  }

  async findUsable(userId: string, kind: LateGrantKind, periodKey: string, now: Date): Promise<LateGrant | null> {
    const doc = await LateGrantModel.findOne({ userId: new Types.ObjectId(userId), kind, periodKey, ...usable(now) }).lean();
    return doc ? toGrant(doc) : null;
  }

  async create(input: NewLateGrant, now: Date): Promise<LateGrant | null> {
    const userId = new Types.ObjectId(input.userId);
    // An expired grant still holds the one-OPEN-per-period slot until it's closed here.
    await LateGrantModel.updateMany(
      { userId, kind: input.kind, periodKey: input.periodKey, status: 'OPEN', expiresAt: { $lte: now } },
      { $set: { status: 'EXPIRED' } },
    );
    try {
      const doc = await LateGrantModel.create({ ...input, userId, grantedBy: new Types.ObjectId(input.grantedBy), status: 'OPEN' });
      return toGrant(doc.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async consume(id: string, now: Date, usedRef: string | null, ctx?: TransactionContext): Promise<boolean> {
    const result = await LateGrantModel.updateOne(
      { _id: id, ...usable(now) },
      { $set: { status: 'USED', usedAt: now, usedRef } },
      ctx ? { session: ctx as ClientSession } : {},
    );
    return result.matchedCount === 1;
  }

  async revoke(id: string, revokedBy: string, now: Date): Promise<LateGrant | null> {
    const doc = await LateGrantModel.findOneAndUpdate(
      { _id: id, ...usable(now) },
      { $set: { status: 'REVOKED', revokedAt: now, revokedBy: new Types.ObjectId(revokedBy) } },
      { new: true },
    ).lean();
    return doc ? toGrant(doc) : null;
  }

  async listUsable(kinds: LateGrantKind[], periodPrefix: string, now: Date): Promise<LateGrant[]> {
    const docs = await LateGrantModel.find({ kind: { $in: kinds }, periodKey: { $regex: `^${escapeRegex(periodPrefix)}` }, ...usable(now) }).lean();
    return docs.map(toGrant);
  }

  async closeOpenForPeriod(userId: string, kinds: LateGrantKind[], periodPrefix: string, now: Date): Promise<number> {
    const result = await LateGrantModel.updateMany(
      { userId: new Types.ObjectId(userId), kind: { $in: kinds }, periodKey: { $regex: `^${escapeRegex(periodPrefix)}` }, status: 'OPEN' },
      { $set: { status: 'EXPIRED', expiresAt: now } },
    );
    return result.modifiedCount;
  }

  async list(filter: LateGrantFilter, page: { page: number; pageSize: number }): Promise<{ items: LateGrant[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.userIds) query['userId'] = { $in: filter.userIds.map((id) => new Types.ObjectId(id)) };
    if (filter.kinds) query['kind'] = { $in: filter.kinds };
    if (filter.month) query['periodKey'] = { $regex: `^${escapeRegex(filter.month)}` };
    // `EXPIRED` is only written lazily: an OPEN grant past its end is expired too, and an OPEN filter leaves those out.
    const at = filter.now ?? new Date();
    if (filter.status === 'EXPIRED') query['$or'] = [{ status: 'EXPIRED' }, { status: 'OPEN', expiresAt: { $lte: at } }];
    else if (filter.status === 'OPEN') Object.assign(query, { status: 'OPEN', expiresAt: { $gt: at } });
    else if (filter.status) query['status'] = filter.status;
    const [docs, total] = await Promise.all([
      LateGrantModel.find(query).sort({ grantedAt: -1, _id: -1 }).skip((page.page - 1) * page.pageSize).limit(page.pageSize).lean(),
      LateGrantModel.countDocuments(query),
    ]);
    return { items: docs.map(toGrant), total };
  }
}
