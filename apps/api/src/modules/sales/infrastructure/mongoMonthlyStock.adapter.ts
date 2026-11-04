import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { MonthlyStock, Outlet, StockLine, StockStatus } from '../domain/monthlyStock.entity.js';
import type { MonthlyStockRepositoryPort, StockFilter, StockRangeFilter } from '../domain/monthlyStock.repository.port.js';
import { MonthlyStockModel, MonthlyStockUnlockModel, type MonthlyStockDoc } from './monthlyStock.schema.js';

const oid = (id: string) => new Types.ObjectId(id);
const outletKey = (o: Outlet): Pick<MonthlyStockDoc, 'chemistId'> | Pick<MonthlyStockDoc, 'distributorId'> => (o.type === 'CHEMIST' ? { chemistId: oid(o.id) } : { distributorId: oid(o.id) });

const toStock = (d: MonthlyStockDoc & { _id: unknown }): MonthlyStock => ({
  id: String(d._id),
  outlet: d.chemistId ? { type: 'CHEMIST', id: String(d.chemistId) } : { type: 'DISTRIBUTOR', id: String(d.distributorId) },
  productId: String(d.productId),
  month: d.month,
  openingQty: d.openingQty,
  closingQty: d.closingQty,
  recordedBy: String(d.recordedBy),
  recordedAt: d.recordedAt,
  status: d.status ?? 'APPROVED',
  creditedUserIds: (d.creditedUserIds ?? []).map(String),
});

/** A row with no status is older than approval and counts. */
const APPROVED_OR_UNSET = { $in: ['APPROVED', null] };
const statusClause = (statuses: readonly StockStatus[]) => (statuses.includes('APPROVED') ? { $in: [...statuses, null] } : { $in: [...statuses] });

/** The outlets as one `$or` on the two id fields; an empty list matches nothing. */
function outletsFilter(outlets: Outlet[]): FilterQuery<MonthlyStockDoc> {
  const chemists = outlets.filter((o) => o.type === 'CHEMIST').map((o) => oid(o.id));
  const distributors = outlets.filter((o) => o.type === 'DISTRIBUTOR').map((o) => oid(o.id));
  const any: FilterQuery<MonthlyStockDoc>[] = [];
  if (chemists.length > 0) any.push({ chemistId: { $in: chemists } });
  if (distributors.length > 0) any.push({ distributorId: { $in: distributors } });
  return any.length > 0 ? { $or: any } : { _id: { $in: [] } };
}

export class MongoMonthlyStockAdapter implements MonthlyStockRepositoryPort {
  async upsertMany(outlet: Outlet, month: string, lines: StockLine[], by: string, at: Date, ctx?: TransactionContext, status?: StockStatus): Promise<void> {
    await MonthlyStockModel.bulkWrite(
      lines.map((l) => ({
        updateOne: {
          filter: { ...outletKey(outlet), productId: oid(l.productId), month },
          update: { $set: { openingQty: l.openingQty, closingQty: l.closingQty, recordedBy: oid(by), recordedAt: at, ...(status && { status }) } },
          upsert: true,
        },
      })),
      ctx ? { session: ctx as ClientSession } : {},
    );
  }

  async listRange(f: StockRangeFilter, limit: number): Promise<MonthlyStock[]> {
    const idField = f.outletType === 'CHEMIST' ? 'chemistId' : 'distributorId';
    const q: FilterQuery<MonthlyStockDoc> = { status: APPROVED_OR_UNSET, month: { $gte: f.fromMonth, $lte: f.toMonth }, [idField]: f.outletId ? oid(f.outletId) : { $type: 'objectId' } };
    if (f.productId) q.productId = oid(f.productId);
    return (await MonthlyStockModel.find(q).sort({ month: 1, _id: 1 }).limit(limit).lean()).map(toStock);
  }

  async listByRecorder(userId: string, month: string): Promise<MonthlyStock[]> {
    return (await MonthlyStockModel.find({ recordedBy: oid(userId), month, distributorId: { $type: 'objectId' } }).sort({ _id: 1 }).lean()).map(toStock);
  }

  async setStatus(filter: { recordedBy: string; month: string; distributorId?: string }, from: readonly StockStatus[], to: StockStatus, credited?: string[], ctx?: TransactionContext): Promise<number> {
    const q: FilterQuery<MonthlyStockDoc> = { recordedBy: oid(filter.recordedBy), month: filter.month, status: statusClause(from), distributorId: filter.distributorId ? oid(filter.distributorId) : { $type: 'objectId' } };
    const res = await MonthlyStockModel.updateMany(q, { $set: { status: to, ...(credited && { creditedUserIds: credited.map(oid) }) } }, ctx ? { session: ctx as ClientSession } : {});
    return res.modifiedCount;
  }

  async deleteByRecorder(userId: string, month: string, ctx?: TransactionContext): Promise<number> {
    return (await MonthlyStockModel.deleteMany({ recordedBy: oid(userId), month, distributorId: { $type: 'objectId' } }, ctx ? { session: ctx as ClientSession } : {})).deletedCount;
  }

  async list(filter: StockFilter, limit: number): Promise<MonthlyStock[]> {
    const q: FilterQuery<MonthlyStockDoc> = {};
    if (filter.month) q.month = filter.month;
    if (filter.productId) q.productId = oid(filter.productId);
    if (filter.outlets) Object.assign(q, outletsFilter(filter.outlets));
    return (await MonthlyStockModel.find(q).sort({ month: -1, _id: 1 }).limit(limit).lean()).map(toStock);
  }

  async outletsWithStock(month: string, outlets: Outlet[]): Promise<Outlet[]> {
    if (outlets.length === 0) return [];
    const [chemists, distributors] = await Promise.all([
      MonthlyStockModel.distinct('chemistId', { month, ...outletsFilter(outlets) }),
      MonthlyStockModel.distinct('distributorId', { month, ...outletsFilter(outlets) }),
    ]);
    return [...chemists.map((id) => ({ type: 'CHEMIST' as const, id: String(id) })), ...distributors.map((id) => ({ type: 'DISTRIBUTOR' as const, id: String(id) }))];
  }

  async isUnlocked(month: string): Promise<boolean> {
    return (await MonthlyStockUnlockModel.exists({ month })) !== null;
  }

  async unlock(month: string, by: string, at: Date): Promise<void> {
    await MonthlyStockUnlockModel.updateOne({ month }, { $setOnInsert: { unlockedBy: oid(by), unlockedAt: at } }, { upsert: true });
  }
}
