import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { StockStatus } from '../domain/monthlyStock.entity.js';
import type { SecondaryRollup, SecondaryRollupInput } from '../domain/secondaryRollup.entity.js';
import type { SecondaryRollupRangeFilter, SecondaryRollupRepositoryPort } from '../domain/secondaryRollup.repository.port.js';
import { SecondaryRollupModel, type SecondaryRollupDoc } from './secondaryRollup.schema.js';

const oid = (id: string) => new Types.ObjectId(id);
const session = (ctx?: TransactionContext) => (ctx ? { session: ctx as ClientSession } : {});
const toRollup = (d: SecondaryRollupDoc & { _id: unknown }): SecondaryRollup => ({
  id: String(d._id),
  userId: String(d.userId),
  month: d.month,
  status: d.status,
  requestId: d.requestId ?? null,
  designation: { name: d.designation?.name ?? null, level: d.designation?.level ?? null },
  lines: d.lines.map((l) => ({ distributorId: String(l.distributorId), productId: String(l.productId), openingQty: l.openingQty, primaryQty: l.primaryQty, issuedQty: l.issuedQty })),
  sources: d.sources.map((s) => ({ ...s, requestId: s.requestId ?? null, decidedAt: s.decidedAt ?? null })),
  submittedAt: d.submittedAt,
  approvedAt: d.approvedAt ?? null,
});

export class MongoSecondaryRollupAdapter implements SecondaryRollupRepositoryPort {
  async save(r: SecondaryRollupInput, ctx?: TransactionContext): Promise<void> {
    const doc = { ...r, userId: oid(r.userId), lines: r.lines.map((l) => ({ ...l, distributorId: oid(l.distributorId), productId: oid(l.productId) })) };
    await SecondaryRollupModel.replaceOne({ userId: oid(r.userId), month: r.month }, doc, { upsert: true, ...session(ctx) });
  }

  async find(userId: string, month: string): Promise<SecondaryRollup | null> {
    const d = await SecondaryRollupModel.findOne({ userId: oid(userId), month }).lean();
    return d ? toRollup(d) : null;
  }

  async listRange(f: SecondaryRollupRangeFilter, limit: number): Promise<SecondaryRollup[]> {
    if (f.userIds && f.userIds.length === 0) return [];
    const q: FilterQuery<SecondaryRollupDoc> = { month: { $gte: f.fromMonth, $lte: f.toMonth }, status: { $in: [...(f.statuses ?? ['APPROVED'])] } };
    if (f.userIds) q.userId = { $in: f.userIds.map(oid) };
    return (await SecondaryRollupModel.find(q).sort({ month: 1, _id: 1 }).limit(limit).lean()).map(toRollup);
  }

  async setStatus(filter: { userId: string; month: string }, from: readonly StockStatus[], to: StockStatus, approvedAt?: Date | null, ctx?: TransactionContext): Promise<number> {
    const set: Record<string, unknown> = { status: to };
    if (approvedAt !== undefined) set['approvedAt'] = approvedAt;
    return (await SecondaryRollupModel.updateMany({ userId: oid(filter.userId), month: filter.month, status: { $in: [...from] } }, { $set: set }, session(ctx))).modifiedCount;
  }

  async deleteByUser(userId: string, month: string, ctx?: TransactionContext): Promise<number> {
    return (await SecondaryRollupModel.deleteMany({ userId: oid(userId), month }, session(ctx))).deletedCount;
  }
}
