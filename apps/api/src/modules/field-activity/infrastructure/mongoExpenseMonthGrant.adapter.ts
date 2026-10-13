import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ExpenseGrantPhase, ExpenseMonthGrant } from '../domain/expenseMonthGrant.entity.js';
import type { ExpenseMonthGrantFilter, ExpenseMonthGrantRepositoryPort } from '../domain/expenseMonthGrant.repository.port.js';
import { ExpenseMonthGrantModel, type ExpenseMonthGrantDoc } from './expenseMonthGrant.schema.js';

const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;

function toGrant(doc: ExpenseMonthGrantDoc & { _id: unknown }): ExpenseMonthGrant {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    month: doc.month,
    phase: doc.phase,
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

export class MongoExpenseMonthGrantAdapter implements ExpenseMonthGrantRepositoryPort {
  async findById(id: string): Promise<ExpenseMonthGrant | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ExpenseMonthGrantModel.findById(id).lean();
    return doc ? toGrant(doc) : null;
  }

  async findUsable(userId: string, month: string, phase: ExpenseGrantPhase, now: Date): Promise<ExpenseMonthGrant | null> {
    const doc = await ExpenseMonthGrantModel.findOne({ userId: new Types.ObjectId(userId), month, phase, ...usable(now) }).lean();
    return doc ? toGrant(doc) : null;
  }

  async listUsableForMonth(month: string, now: Date): Promise<ExpenseMonthGrant[]> {
    return (await ExpenseMonthGrantModel.find({ month, ...usable(now) }).lean()).map(toGrant);
  }

  async create(input: Omit<ExpenseMonthGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date): Promise<ExpenseMonthGrant | null> {
    const userId = new Types.ObjectId(input.userId);
    // An expired grant still holds the one-OPEN slot until it is closed here.
    await ExpenseMonthGrantModel.updateMany({ userId, month: input.month, phase: input.phase, status: 'OPEN', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } });
    try {
      const doc = await ExpenseMonthGrantModel.create({ ...input, userId, grantedBy: new Types.ObjectId(input.grantedBy), status: 'OPEN' });
      return toGrant(doc.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async consume(id: string, now: Date, ctx: TransactionContext): Promise<boolean> {
    const result = await ExpenseMonthGrantModel.updateOne({ _id: id, ...usable(now) }, { $set: { status: 'USED', usedAt: now } }, { session: ctx as ClientSession });
    return result.matchedCount === 1;
  }

  async revoke(id: string, revokedBy: string, now: Date): Promise<ExpenseMonthGrant | null> {
    const doc = await ExpenseMonthGrantModel.findOneAndUpdate({ _id: id, ...usable(now) }, { $set: { status: 'REVOKED', revokedAt: now, revokedBy: new Types.ObjectId(revokedBy) } }, { new: true }).lean();
    return doc ? toGrant(doc) : null;
  }

  async list(filter: ExpenseMonthGrantFilter, page: { page: number; pageSize: number }): Promise<{ items: ExpenseMonthGrant[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.userIds) query['userId'] = { $in: filter.userIds.map((id) => new Types.ObjectId(id)) };
    const [docs, total] = await Promise.all([
      ExpenseMonthGrantModel.find(query).sort({ grantedAt: -1, _id: -1 }).skip((page.page - 1) * page.pageSize).limit(page.pageSize).lean(),
      ExpenseMonthGrantModel.countDocuments(query),
    ]);
    return { items: docs.map(toGrant), total };
  }
}
