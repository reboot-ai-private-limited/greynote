import { Types, type FilterQuery } from 'mongoose';
import type { StatementLine, StockStatement } from '../domain/stockStatement.entity.js';
import type { StatementRangeFilter, StockStatementRepositoryPort } from '../domain/stockStatement.repository.port.js';
import { StockStatementModel, type StockStatementDoc } from './stockStatement.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toStatement = (d: StockStatementDoc & { _id: unknown }): StockStatement => ({
  id: String(d._id),
  distributorId: String(d.distributorId),
  productId: String(d.productId),
  month: d.month,
  openingQty: d.openingQty,
  secondaryQty: d.secondaryQty,
  adjustmentQty: d.adjustmentQty,
  adjustmentReason: d.adjustmentReason,
  enteredBy: String(d.enteredBy),
  enteredAt: d.enteredAt,
  updatedBy: String(d.updatedBy),
  updatedAt: d.updatedAt,
  history: d.history.map((h) => ({ by: String(h.by), at: h.at, openingQty: h.openingQty, secondaryQty: h.secondaryQty, adjustmentQty: h.adjustmentQty, adjustmentReason: h.adjustmentReason })),
});

export class MongoStockStatementAdapter implements StockStatementRepositoryPort {
  async list(f: StatementRangeFilter, limit: number): Promise<StockStatement[]> {
    const q: FilterQuery<StockStatementDoc> = { month: { $gte: f.fromMonth, $lte: f.toMonth } };
    if (f.distributorId) q.distributorId = oid(f.distributorId);
    if (f.productId) q.productId = oid(f.productId);
    return (await StockStatementModel.find(q).sort({ month: 1, _id: 1 }).limit(limit).lean()).map(toStatement);
  }

  async upsertMany(distributorId: string, month: string, lines: StatementLine[], by: string, at: Date): Promise<{ added: number; changed: number }> {
    const existing = new Map((await StockStatementModel.find({ distributorId: oid(distributorId), month, productId: { $in: lines.map((l) => oid(l.productId)) } }).lean()).map((d) => [String(d.productId), d]));
    const ops: Parameters<typeof StockStatementModel.bulkWrite>[0] = [];
    let added = 0;
    let changed = 0;
    for (const l of lines) {
      const old = existing.get(l.productId);
      if (!old) {
        added += 1;
        ops.push({
          insertOne: { document: { distributorId: oid(distributorId), productId: oid(l.productId), month, openingQty: l.openingQty, secondaryQty: l.secondaryQty, adjustmentQty: l.adjustmentQty, adjustmentReason: l.reason, enteredBy: oid(by), enteredAt: at, updatedBy: oid(by), updatedAt: at, history: [] } },
        });
        continue;
      }
      if (old.openingQty === l.openingQty && old.secondaryQty === l.secondaryQty && old.adjustmentQty === l.adjustmentQty && old.adjustmentReason === l.reason) continue;
      changed += 1;
      ops.push({
        updateOne: {
          filter: { _id: old._id },
          update: {
            $set: { openingQty: l.openingQty, secondaryQty: l.secondaryQty, adjustmentQty: l.adjustmentQty, adjustmentReason: l.reason, updatedBy: oid(by), updatedAt: at },
            // The line's previous values, appended to its history.
            $push: { history: { by: old.updatedBy, at: old.updatedAt, openingQty: old.openingQty, secondaryQty: old.secondaryQty, adjustmentQty: old.adjustmentQty, adjustmentReason: old.adjustmentReason } } as never,
          },
        },
      });
    }
    if (ops.length > 0) await StockStatementModel.bulkWrite(ops);
    return { added, changed };
  }
}
