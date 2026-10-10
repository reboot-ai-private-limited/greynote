import { Types, type FilterQuery } from 'mongoose';
import type { EmployeeSale } from '../domain/employeeSale.entity.js';
import type { EmployeeSaleFilter, EmployeeSaleRepositoryPort } from '../domain/employeeSale.repository.port.js';
import { EmployeeSaleModel, type EmployeeSaleDoc } from './employeeSale.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toEmployeeSale = (d: EmployeeSaleDoc & { _id: unknown }): EmployeeSale => ({
  id: String(d._id),
  userId: String(d.userId),
  productId: String(d.productId),
  month: d.month,
  secondaryQty: d.secondaryQty,
  adjustmentQty: d.adjustmentQty,
  adjustmentReason: d.adjustmentReason,
  updatedBy: String(d.updatedBy),
  updatedAt: d.updatedAt,
  history: d.history.map((h) => ({ by: String(h.by), at: h.at, secondaryQty: h.secondaryQty, adjustmentQty: h.adjustmentQty, adjustmentReason: h.adjustmentReason })),
});

export class MongoEmployeeSaleAdapter implements EmployeeSaleRepositoryPort {
  async list(f: EmployeeSaleFilter, limit: number): Promise<EmployeeSale[]> {
    const q: FilterQuery<EmployeeSaleDoc> = { month: { $gte: f.fromMonth, $lte: f.toMonth } };
    if (f.userIds) q.userId = { $in: f.userIds.map(oid) };
    if (f.productId) q.productId = oid(f.productId);
    return (await EmployeeSaleModel.find(q).sort({ month: 1, _id: 1 }).limit(limit).lean()).map(toEmployeeSale);
  }

  setSecondary(userId: string, month: string, lines: Array<{ productId: string; qty: number }>, by: string, at: Date) {
    return this.write(userId, month, lines.map((l) => ({ productId: l.productId, secondaryQty: l.qty })), by, at);
  }

  setAdjustment(userId: string, month: string, lines: Array<{ productId: string; qty: number; reason: string | null }>, by: string, at: Date) {
    return this.write(userId, month, lines.map((l) => ({ productId: l.productId, adjustmentQty: l.qty, adjustmentReason: l.reason })), by, at);
  }

  /** Inserts a line that is not there; for one that is, changes only the fields given, and only when they differ, keeping the old values in `history`. */
  private async write(userId: string, month: string, changes: Array<{ productId: string; secondaryQty?: number; adjustmentQty?: number; adjustmentReason?: string | null }>, by: string, at: Date) {
    const existing = new Map((await EmployeeSaleModel.find({ userId: oid(userId), month, productId: { $in: changes.map((c) => oid(c.productId)) } }).lean()).map((d) => [String(d.productId), d]));
    const ops: Parameters<typeof EmployeeSaleModel.bulkWrite>[0] = [];
    let added = 0;
    let changed = 0;
    for (const c of changes) {
      const old = existing.get(c.productId);
      const next = { secondaryQty: c.secondaryQty ?? old?.secondaryQty ?? null, adjustmentQty: c.adjustmentQty ?? old?.adjustmentQty ?? 0, adjustmentReason: c.adjustmentReason !== undefined ? c.adjustmentReason : (old?.adjustmentReason ?? null) };
      if (!old) {
        added += 1;
        ops.push({ insertOne: { document: { userId: oid(userId), productId: oid(c.productId), month, ...next, updatedBy: oid(by), updatedAt: at, history: [] } } });
        continue;
      }
      if (old.secondaryQty === next.secondaryQty && old.adjustmentQty === next.adjustmentQty && old.adjustmentReason === next.adjustmentReason) continue;
      changed += 1;
      ops.push({
        updateOne: {
          filter: { _id: old._id },
          update: {
            $set: { ...next, updatedBy: oid(by), updatedAt: at },
            $push: { history: { by: old.updatedBy, at: old.updatedAt, secondaryQty: old.secondaryQty, adjustmentQty: old.adjustmentQty, adjustmentReason: old.adjustmentReason } } as never,
          },
        },
      });
    }
    if (ops.length > 0) await EmployeeSaleModel.bulkWrite(ops);
    return { added, changed };
  }
}
