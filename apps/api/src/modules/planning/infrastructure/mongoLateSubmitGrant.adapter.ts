import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LateSubmitGrant } from '../domain/lateSubmitGrant.entity.js';
import type {
  LateSubmitGrantFilter,
  LateSubmitGrantRepositoryPort,
} from '../domain/lateSubmitGrant.repository.port.js';
import type { PlanKind } from '../domain/plan.js';
import { LateSubmitGrantModel, type LateSubmitGrantDoc } from './lateSubmitGrant.schema.js';
import { isDuplicateKey } from './planDoc.js';

function toGrant(doc: LateSubmitGrantDoc & { _id: unknown }): LateSubmitGrant {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    kind: doc.kind,
    planKey: doc.planKey,
    reason: doc.reason,
    grantedBy: String(doc.grantedBy),
    grantedByRole: doc.grantedByRole,
    grantedAt: doc.grantedAt,
    expiresAt: doc.expiresAt,
    status: doc.status,
    usedAt: doc.usedAt,
    revokedAt: doc.revokedAt,
    revokedBy: doc.revokedBy === null ? null : String(doc.revokedBy),
  };
}

/** Still usable at `now`. */
const usable = (now: Date) => ({ status: 'OPEN', expiresAt: { $gt: now } });

export class MongoLateSubmitGrantAdapter implements LateSubmitGrantRepositoryPort {
  async findById(id: string): Promise<LateSubmitGrant | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LateSubmitGrantModel.findById(id).lean();
    return doc ? toGrant(doc) : null;
  }

  async findUsable(userId: string, kind: PlanKind, planKey: string, now: Date): Promise<LateSubmitGrant | null> {
    const doc = await LateSubmitGrantModel.findOne({ userId: new Types.ObjectId(userId), kind, planKey, ...usable(now) }).lean();
    return doc ? toGrant(doc) : null;
  }

  async create(
    input: Omit<LateSubmitGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>,
    now: Date,
  ): Promise<LateSubmitGrant | null> {
    const userId = new Types.ObjectId(input.userId);
    // An expired grant still holds the one-OPEN-per-Plan slot until it's closed here.
    await LateSubmitGrantModel.updateMany(
      { userId, kind: input.kind, planKey: input.planKey, status: 'OPEN', expiresAt: { $lte: now } },
      { $set: { status: 'EXPIRED' } },
    );
    try {
      const doc = await LateSubmitGrantModel.create({
        ...input,
        userId,
        grantedBy: new Types.ObjectId(input.grantedBy),
        status: 'OPEN',
      });
      return toGrant(doc.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async consume(id: string, now: Date, ctx: TransactionContext): Promise<boolean> {
    const result = await LateSubmitGrantModel.updateOne(
      { _id: id, ...usable(now) },
      { $set: { status: 'USED', usedAt: now } },
      { session: ctx as ClientSession },
    );
    return result.matchedCount === 1;
  }

  async revoke(id: string, revokedBy: string, now: Date): Promise<LateSubmitGrant | null> {
    const doc = await LateSubmitGrantModel.findOneAndUpdate(
      { _id: id, ...usable(now) },
      { $set: { status: 'REVOKED', revokedAt: now, revokedBy: new Types.ObjectId(revokedBy) } },
      { new: true },
    ).lean();
    return doc ? toGrant(doc) : null;
  }

  async list(
    filter: LateSubmitGrantFilter,
    page: { page: number; pageSize: number },
  ): Promise<{ items: LateSubmitGrant[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.userIds) query['userId'] = { $in: filter.userIds.map((id) => new Types.ObjectId(id)) };
    if (filter.kind) query['kind'] = filter.kind;
    const [docs, total] = await Promise.all([
      LateSubmitGrantModel.find(query)
        .sort({ grantedAt: -1, _id: -1 })
        .skip((page.page - 1) * page.pageSize)
        .limit(page.pageSize)
        .lean(),
      LateSubmitGrantModel.countDocuments(query),
    ]);
    return { items: docs.map(toGrant), total };
  }
}
