import { Types, type FilterQuery } from 'mongoose';
import type { SampleRequest, SampleRequestKind, SampleRequestStatus } from '../domain/sampleRequest.entity.js';
import type { GivenTotalsPort, SampleRequestRepositoryPort } from '../domain/sampleRequest.repository.port.js';
import { DoctorCallModel } from './records.schema.js';
import { SampleRequestModel, type SampleRequestDoc } from './sampleRequest.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toRequest = (d: SampleRequestDoc & { _id: unknown }): SampleRequest => ({
  id: String(d._id),
  userId: String(d.userId),
  kind: d.kind,
  lines: d.lines.map((l) => ({ productId: String(l.productId), quantity: l.quantity, creditedQuantity: l.creditedQuantity ?? null })),
  remarks: d.remarks ?? null,
  status: d.status,
  requestedAt: d.requestedAt,
  doneBy: d.doneBy ? String(d.doneBy) : null,
  doneAt: d.doneAt ?? null,
});

export class MongoSampleRequestAdapter implements SampleRequestRepositoryPort, GivenTotalsPort {
  async create(input: Omit<SampleRequest, 'id'>): Promise<SampleRequest> {
    const doc = await SampleRequestModel.create({ ...input, userId: oid(input.userId), lines: input.lines.map((l) => ({ ...l, productId: oid(l.productId) })), doneBy: null, doneAt: null });
    return toRequest(doc.toObject());
  }
  async findById(id: string): Promise<SampleRequest | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await SampleRequestModel.findById(id).lean();
    return doc ? toRequest(doc) : null;
  }
  async list(filter: { userId?: string; status?: SampleRequestStatus; kind?: SampleRequestKind }, limit: number): Promise<SampleRequest[]> {
    const q: FilterQuery<SampleRequestDoc> = {};
    if (filter.userId) q.userId = oid(filter.userId);
    if (filter.status) q.status = filter.status;
    if (filter.kind) q.kind = filter.kind;
    return (await SampleRequestModel.find(q).sort({ requestedAt: -1, _id: -1 }).limit(limit).lean()).map(toRequest);
  }
  async markDone(id: string, by: string, at: Date, credits: Array<{ productId: string; creditedQuantity: number }>): Promise<SampleRequest | null> {
    const current = await SampleRequestModel.findOne({ _id: oid(id), status: 'REQUESTED' }).lean();
    if (!current) return null;
    const byProduct = new Map(credits.map((c) => [c.productId, c.creditedQuantity]));
    const lines = current.lines.map((l) => ({ ...l, creditedQuantity: byProduct.get(String(l.productId)) ?? l.quantity }));
    const doc = await SampleRequestModel.findOneAndUpdate({ _id: oid(id), status: 'REQUESTED' }, { $set: { status: 'DONE', doneBy: oid(by), doneAt: at, lines } }, { new: true }).lean();
    return doc ? toRequest(doc) : null;
  }
  async cancel(id: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await SampleRequestModel.updateOne({ _id: oid(id), userId: oid(userId), status: 'REQUESTED' }, { $set: { status: 'CANCELLED' } });
    return res.modifiedCount === 1;
  }

  async givenBy(userId: string) {
    const [samples, lbl] = await Promise.all([
      DoctorCallModel.aggregate<{ _id: Types.ObjectId; quantity: number }>([{ $match: { userId: oid(userId) } }, { $unwind: '$samples' }, { $group: { _id: '$samples.productId', quantity: { $sum: '$samples.quantity' } } }]),
      DoctorCallModel.aggregate<{ _id: Types.ObjectId; quantity: number }>([{ $match: { userId: oid(userId) } }, { $unwind: '$lbl' }, { $group: { _id: '$lbl.productId', quantity: { $sum: 1 } } }]),
    ]);
    const lines = (rows: Array<{ _id: Types.ObjectId; quantity: number }>) => rows.map((r) => ({ productId: String(r._id), quantity: r.quantity }));
    return { samples: lines(samples), lbl: lines(lbl) };
  }
}
