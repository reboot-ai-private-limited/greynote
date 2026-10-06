import { Types } from 'mongoose';
import type { ManagerChange } from '../domain/managerHistory.js';
import type { ManagerHistoryRepositoryPort } from '../domain/managerHistory.repository.port.js';
import { ManagerChangeModel, type ManagerChangeDocument } from './managerChange.schema.js';

const oidOrNull = (id: string | null): Types.ObjectId | null => (id === null ? null : new Types.ObjectId(id));
const idOrNull = (id: Types.ObjectId | null): string | null => (id === null ? null : String(id));

function toChange(doc: ManagerChangeDocument & { _id: unknown }): ManagerChange {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    managerId: idOrNull(doc.managerId),
    previousManagerId: idOrNull(doc.previousManagerId),
    effectiveFrom: doc.effectiveFrom,
    source: doc.source,
    promotionId: idOrNull(doc.promotionId),
    createdBy: idOrNull(doc.createdBy),
    createdAt: doc.createdAt,
  };
}

export class MongoManagerHistoryAdapter implements ManagerHistoryRepositoryPort {
  async record(input: Omit<ManagerChange, 'id' | 'createdAt'>): Promise<ManagerChange> {
    const doc = await ManagerChangeModel.create({
      userId: new Types.ObjectId(input.userId),
      managerId: oidOrNull(input.managerId),
      previousManagerId: oidOrNull(input.previousManagerId),
      effectiveFrom: input.effectiveFrom,
      source: input.source,
      promotionId: oidOrNull(input.promotionId),
      createdBy: oidOrNull(input.createdBy),
    });
    return toChange(doc.toObject());
  }

  async listByUser(userId: string): Promise<ManagerChange[]> {
    const docs = await ManagerChangeModel.find({ userId: new Types.ObjectId(userId) }).sort({ effectiveFrom: 1, createdAt: 1 }).lean();
    return docs.map(toChange);
  }
}
