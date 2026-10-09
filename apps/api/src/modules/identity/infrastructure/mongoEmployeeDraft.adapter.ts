import { Types } from 'mongoose';
import type { EmployeeDraft, EmployeeDraftData } from '../domain/employeeDraft.entity.js';
import type { EmployeeDraftRepositoryPort } from '../domain/employeeDraft.repository.port.js';
import { EmployeeDraftModel, type EmployeeDraftDoc } from './employeeDraft.schema.js';

function toDraft(doc: EmployeeDraftDoc & { _id: unknown }): EmployeeDraft {
  return {
    id: String(doc._id),
    createdBy: String(doc.createdBy),
    step: doc.step,
    data: doc.data as EmployeeDraftData,
    createdUserId: doc.createdUserId ? String(doc.createdUserId) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const isObjectId = (id: string): boolean => Types.ObjectId.isValid(id);

export class MongoEmployeeDraftAdapter implements EmployeeDraftRepositoryPort {
  async create(input: { createdBy: string; step: number; data: EmployeeDraftData }): Promise<EmployeeDraft> {
    const doc = await EmployeeDraftModel.create({ ...input, createdBy: new Types.ObjectId(input.createdBy) });
    return toDraft(doc.toObject());
  }

  async findById(id: string): Promise<EmployeeDraft | null> {
    if (!isObjectId(id)) return null;
    const doc = await EmployeeDraftModel.findById(id).lean();
    return doc ? toDraft(doc) : null;
  }

  async list(): Promise<EmployeeDraft[]> {
    const docs = await EmployeeDraftModel.find().sort({ updatedAt: -1 }).lean();
    return docs.map(toDraft);
  }

  async update(
    id: string,
    patch: { step?: number; data?: EmployeeDraftData; createdUserId?: string },
  ): Promise<EmployeeDraft | null> {
    if (!isObjectId(id)) return null;
    const set: Record<string, unknown> = {};
    if (patch.step !== undefined) set.step = patch.step;
    if (patch.data !== undefined) set.data = patch.data;
    if (patch.createdUserId !== undefined) set.createdUserId = new Types.ObjectId(patch.createdUserId);
    const doc = await EmployeeDraftModel.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    return doc ? toDraft(doc) : null;
  }

  async delete(id: string): Promise<void> {
    if (!isObjectId(id)) return;
    await EmployeeDraftModel.deleteOne({ _id: new Types.ObjectId(id) });
  }
}
