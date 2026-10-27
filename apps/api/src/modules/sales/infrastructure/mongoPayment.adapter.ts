import { Types } from 'mongoose';
import type { DistributorPayment } from '../domain/payment.entity.js';
import type { PaymentRepositoryPort } from '../domain/payment.repository.port.js';
import { PaymentModel, type PaymentDoc } from './payment.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toPayment = (d: PaymentDoc & { _id: unknown }): DistributorPayment => ({
  id: String(d._id),
  distributorId: String(d.distributorId),
  paymentDate: d.paymentDate,
  amountPaise: d.amountPaise,
  mode: d.mode,
  reference: d.reference,
  note: d.note,
  allocations: (d.allocations ?? []).map((a) => ({ orderId: String(a.orderId), amountPaise: a.amountPaise })),
  status: d.status,
  recordedBy: String(d.recordedBy),
  createdAt: d.createdAt,
  cancelledBy: d.cancelledBy ? String(d.cancelledBy) : null,
  cancelledAt: d.cancelledAt,
  cancelReason: d.cancelReason,
});

export class MongoPaymentAdapter implements PaymentRepositoryPort {
  async create(input: Omit<DistributorPayment, 'id'>): Promise<DistributorPayment> {
    const doc = await PaymentModel.create({ ...input, distributorId: oid(input.distributorId), recordedBy: oid(input.recordedBy), cancelledBy: null, allocations: input.allocations.map((a) => ({ orderId: oid(a.orderId), amountPaise: a.amountPaise })) });
    return toPayment(doc.toObject());
  }

  async findById(id: string): Promise<DistributorPayment | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await PaymentModel.findById(id).lean();
    return doc ? toPayment(doc) : null;
  }

  async list(filter: { distributorId: string; from: string; to: string }, limit: number): Promise<DistributorPayment[]> {
    const docs = await PaymentModel.find({ distributorId: oid(filter.distributorId), paymentDate: { $gte: filter.from, $lte: filter.to } })
      .sort({ paymentDate: -1, _id: -1 })
      .limit(limit)
      .lean();
    return docs.map(toPayment);
  }

  async totals(range: { from: string; to: string }): Promise<Array<{ distributorId: string; collectedPaise: number }>> {
    const rows = await PaymentModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { status: 'RECORDED', paymentDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$distributorId', total: { $sum: '$amountPaise' } } },
    ]);
    return rows.map((r) => ({ distributorId: String(r._id), collectedPaise: r.total }));
  }

  async collectedAllTime(): Promise<Map<string, number>> {
    const rows = await PaymentModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { status: 'RECORDED' } },
      { $group: { _id: '$distributorId', total: { $sum: '$amountPaise' } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.total]));
  }

  async allocatedToOrders(orderIds: string[]): Promise<Map<string, number>> {
    if (orderIds.length === 0) return new Map();
    const ids = orderIds.map(oid);
    const rows = await PaymentModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { status: 'RECORDED', 'allocations.orderId': { $in: ids } } },
      { $unwind: '$allocations' },
      { $match: { 'allocations.orderId': { $in: ids } } },
      { $group: { _id: '$allocations.orderId', total: { $sum: '$allocations.amountPaise' } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.total]));
  }

  async cancel(id: string, by: string, at: Date, reason: string): Promise<boolean> {
    const res = await PaymentModel.updateOne({ _id: oid(id), status: 'RECORDED' }, { $set: { status: 'CANCELLED', cancelledBy: oid(by), cancelledAt: at, cancelReason: reason } });
    return res.modifiedCount === 1;
  }
}
