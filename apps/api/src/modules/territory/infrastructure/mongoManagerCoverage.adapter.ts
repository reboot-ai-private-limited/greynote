import { Types } from 'mongoose';
import type { ManagerCoverage } from '../domain/managerCoverage.entity.js';
import type { ManagerCoverageRepositoryPort } from '../domain/managerCoverage.repository.port.js';
import { ManagerCoverageModel, type ManagerCoverageDoc } from './managerCoverage.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toCoverage = (d: ManagerCoverageDoc): ManagerCoverage => ({
  userId: String(d.userId),
  hqIds: d.hqIds.map(String),
  zoneIds: d.zoneIds.map(String),
  updatedAt: d.updatedAt,
  updatedBy: String(d.updatedBy),
});

export class MongoManagerCoverageAdapter implements ManagerCoverageRepositoryPort {
  async find(userId: string): Promise<ManagerCoverage | null> {
    const doc = await ManagerCoverageModel.findOne({ userId: oid(userId) }).lean();
    return doc ? toCoverage(doc) : null;
  }

  async findMany(userIds: string[]): Promise<ManagerCoverage[]> {
    if (userIds.length === 0) return [];
    return (await ManagerCoverageModel.find({ userId: { $in: userIds.map(oid) } }).lean()).map(toCoverage);
  }

  async save(input: { userId: string; hqIds: string[]; zoneIds: string[]; updatedBy: string }): Promise<ManagerCoverage> {
    const doc = await ManagerCoverageModel.findOneAndUpdate(
      { userId: oid(input.userId) },
      { $set: { hqIds: input.hqIds.map(oid), zoneIds: input.zoneIds.map(oid), updatedAt: new Date(), updatedBy: oid(input.updatedBy) } },
      { upsert: true, new: true },
    ).lean();
    return toCoverage(doc);
  }
}
