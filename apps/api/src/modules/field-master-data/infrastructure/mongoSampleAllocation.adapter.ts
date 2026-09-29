import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SampleAllocation } from '../domain/sampleAllocation.entity.js';
import type { SampleAllocationRepositoryPort } from '../domain/sampleAllocation.repository.port.js';
import { isDuplicateKey } from './mongoHelpers.js';
import { SampleAllocationModel, type SampleAllocationDoc } from './sampleAllocation.schema.js';

const toAllocation = (doc: SampleAllocationDoc & { _id: unknown }): SampleAllocation => ({
  id: String(doc._id),
  doctorId: String(doc.doctorId),
  productId: String(doc.productId),
  quantityAllocated: doc.quantityAllocated,
  quantityRemaining: doc.quantityRemaining,
  allocatedBy: String(doc.allocatedBy),
  allocatedAt: doc.allocatedAt,
});

const oid = (id: string) => new Types.ObjectId(id);
const key = (doctorId: string, productId: string) => ({ doctorId: oid(doctorId), productId: oid(productId) });

export class MongoSampleAllocationAdapter implements SampleAllocationRepositoryPort {
  async find(doctorId: string, productId: string): Promise<SampleAllocation | null> {
    const doc = await SampleAllocationModel.findOne(key(doctorId, productId)).lean();
    return doc ? toAllocation(doc) : null;
  }

  async findById(id: string): Promise<SampleAllocation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await SampleAllocationModel.findById(id).lean();
    return doc ? toAllocation(doc) : null;
  }

  async listForDoctor(doctorId: string): Promise<SampleAllocation[]> {
    return (await SampleAllocationModel.find({ doctorId: oid(doctorId) }).sort({ allocatedAt: -1, _id: -1 }).lean()).map(toAllocation);
  }

  async listForDoctors(doctorIds: string[]): Promise<SampleAllocation[]> {
    if (doctorIds.length === 0) return [];
    return (await SampleAllocationModel.find({ doctorId: { $in: doctorIds.map(oid) } }).sort({ _id: 1 }).lean()).map(toAllocation);
  }

  async issue(input: { doctorId: string; productId: string; quantity: number; by: string }): Promise<SampleAllocation> {
    const run = () =>
      SampleAllocationModel.findOneAndUpdate(
        key(input.doctorId, input.productId),
        {
          $inc: { quantityAllocated: input.quantity, quantityRemaining: input.quantity },
          $set: { allocatedBy: oid(input.by), allocatedAt: new Date() },
        },
        { upsert: true, new: true },
      ).lean();
    try {
      return toAllocation((await run())!);
    } catch (err) {
      // Two first-time issues racing: the other one created the row — a second pass tops it up.
      if (!isDuplicateKey(err)) throw err;
      return toAllocation((await run())!);
    }
  }

  async setAllocated(input: { doctorId: string; productId: string; total: number; by: string }): Promise<SampleAllocation | null> {
    const given = { $subtract: ['$quantityAllocated', '$quantityRemaining'] };
    const doc = await SampleAllocationModel.findOneAndUpdate(
      { ...key(input.doctorId, input.productId), $expr: { $lte: [given, input.total] } },
      [
        {
          $set: {
            quantityRemaining: { $subtract: [input.total, given] },
            quantityAllocated: input.total,
            allocatedBy: oid(input.by),
            allocatedAt: new Date(),
          },
        },
      ],
      { new: true },
    ).lean();
    return doc ? toAllocation(doc) : null;
  }

  async decrementRemaining(allocationId: string, quantity: number, ctx?: TransactionContext): Promise<boolean> {
    const result = await SampleAllocationModel.updateOne(
      { _id: oid(allocationId), quantityRemaining: { $gte: quantity } },
      { $inc: { quantityRemaining: -quantity } },
      ctx === undefined ? {} : { session: ctx as ClientSession },
    );
    return result.modifiedCount === 1;
  }
}
