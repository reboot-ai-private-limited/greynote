import { Types } from 'mongoose';
import type { LeaveType } from '../domain/leaveType.entity.js';
import type { LeaveTypeRepositoryPort } from '../domain/leaveType.repository.port.js';
import { LeaveTypeModel, type LeaveTypeDoc } from './leaveType.schema.js';
import { isDuplicateKey, toNameKey } from './mongoHelpers.js';

const toType = (doc: LeaveTypeDoc & { _id: unknown }): LeaveType => ({
  id: String(doc._id),
  name: doc.name,
  isPaid: doc.isPaid,
  active: doc.active,
});

export class MongoLeaveTypeAdapter implements LeaveTypeRepositoryPort {
  async list(): Promise<LeaveType[]> {
    return (await LeaveTypeModel.find().sort({ nameKey: 1 }).lean()).map(toType);
  }

  async findById(id: string): Promise<LeaveType | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LeaveTypeModel.findById(id).lean();
    return doc ? toType(doc) : null;
  }

  async create(input: Omit<LeaveType, 'id'>): Promise<LeaveType | null> {
    try {
      const doc = await LeaveTypeModel.create({ ...input, nameKey: toNameKey(input.name) });
      return toType(doc.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async update(id: string, change: Partial<Omit<LeaveType, 'id'>>): Promise<LeaveType | null> {
    try {
      const doc = await LeaveTypeModel.findByIdAndUpdate(
        id,
        { ...change, ...(change.name !== undefined && { nameKey: toNameKey(change.name) }) },
        { new: true },
      ).lean();
      return doc ? toType(doc) : null;
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async seed(defaults: Array<Pick<LeaveType, 'name' | 'isPaid'>>): Promise<void> {
    await LeaveTypeModel.bulkWrite(
      defaults.map((d) => ({
        updateOne: {
          filter: { nameKey: toNameKey(d.name) },
          update: { $setOnInsert: { name: d.name, nameKey: toNameKey(d.name), isPaid: d.isPaid, active: true } },
          upsert: true,
        },
      })),
    );
  }
}
