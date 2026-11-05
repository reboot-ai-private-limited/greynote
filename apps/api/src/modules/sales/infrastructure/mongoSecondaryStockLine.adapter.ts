import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { StockStatus } from '../domain/monthlyStock.entity.js';
import type { SecondaryStockLine, SecondaryStockLineEdit, SecondaryStockLineInput } from '../domain/secondaryStockLine.entity.js';
import type { SecondaryStockLineRepositoryPort, SecondaryStockRangeFilter } from '../domain/secondaryStockLine.repository.port.js';
import { SecondaryStockLineModel, type SecondaryStockLineDoc } from './secondaryStockLine.schema.js';

const oid = (id: string) => new Types.ObjectId(id);
const session = (ctx?: TransactionContext) => (ctx ? { session: ctx as ClientSession } : {});
const toLine = (d: SecondaryStockLineDoc & { _id: unknown }): SecondaryStockLine => ({
  id: String(d._id),
  userId: String(d.userId),
  distributorId: String(d.distributorId),
  productId: String(d.productId),
  month: d.month,
  openingQty: d.openingQty,
  primaryQty: d.primaryQty,
  issuedQty: d.issuedQty,
  status: d.status,
  updatedAt: d.updatedAt,
  managerEdit: d.managerEdit ? { by: String(d.managerEdit.by), at: d.managerEdit.at, reason: d.managerEdit.reason, original: { ...d.managerEdit.original } } : undefined,
});

export class MongoSecondaryStockLineAdapter implements SecondaryStockLineRepositoryPort {
  async upsertMany(userId: string, month: string, lines: readonly SecondaryStockLineInput[], status: StockStatus, at: Date, ctx?: TransactionContext): Promise<void> {
    if (lines.length === 0) return;
    await SecondaryStockLineModel.bulkWrite(
      lines.map((l) => ({
        updateOne: {
          filter: { userId: oid(userId), distributorId: oid(l.distributorId), productId: oid(l.productId), month },
          update: { $set: { openingQty: l.openingQty, primaryQty: l.primaryQty, issuedQty: l.issuedQty, status, updatedAt: at }, $unset: { managerEdit: '' } },
          upsert: true,
        },
      })),
      session(ctx),
    );
  }

  async applyEdits(userId: string, month: string, edits: readonly SecondaryStockLineEdit[], ctx?: TransactionContext): Promise<number> {
    if (edits.length === 0) return 0;
    const res = await SecondaryStockLineModel.bulkWrite(
      edits.map((e) => ({
        updateOne: {
          filter: { userId: oid(userId), distributorId: oid(e.distributorId), productId: oid(e.productId), month, status: 'PENDING' as const },
          update: { $set: { openingQty: e.openingQty, primaryQty: e.primaryQty, issuedQty: e.issuedQty, updatedAt: e.managerEdit.at, managerEdit: { ...e.managerEdit, by: oid(e.managerEdit.by) } } },
        },
      })),
      session(ctx),
    );
    return res.modifiedCount;
  }

  async listByUser(userId: string, month: string): Promise<SecondaryStockLine[]> {
    return (await SecondaryStockLineModel.find({ userId: oid(userId), month }).sort({ _id: 1 }).lean()).map(toLine);
  }

  async listRange(f: SecondaryStockRangeFilter, limit: number): Promise<SecondaryStockLine[]> {
    if (f.userIds && f.userIds.length === 0) return [];
    const q: FilterQuery<SecondaryStockLineDoc> = { month: { $gte: f.fromMonth, $lte: f.toMonth }, status: { $in: [...(f.statuses ?? ['APPROVED'])] } };
    if (f.userIds) q.userId = { $in: f.userIds.map(oid) };
    if (f.distributorId) q.distributorId = oid(f.distributorId);
    if (f.productId) q.productId = oid(f.productId);
    return (await SecondaryStockLineModel.find(q).sort({ month: 1, _id: 1 }).limit(limit).lean()).map(toLine);
  }

  async setStatus(filter: { userId: string; month: string }, from: readonly StockStatus[], to: StockStatus, ctx?: TransactionContext): Promise<number> {
    const res = await SecondaryStockLineModel.updateMany({ userId: oid(filter.userId), month: filter.month, status: { $in: [...from] } }, { $set: { status: to } }, session(ctx));
    return res.modifiedCount;
  }

  async deleteByUser(userId: string, month: string, ctx?: TransactionContext): Promise<number> {
    return (await SecondaryStockLineModel.deleteMany({ userId: oid(userId), month }, session(ctx))).deletedCount;
  }
}
