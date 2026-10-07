import { Types } from 'mongoose';
import type { Dcr } from '../domain/dcr.entity.js';
import type { DcrRepositoryPort } from '../domain/dcr.repository.port.js';
import { DcrModel, type DcrDoc } from './dcr.schema.js';

const toDcr = (doc: DcrDoc & { _id: unknown }): Dcr => ({
  id: String(doc._id),
  userId: String(doc.userId),
  reportDate: doc.reportDate,
  createdAt: doc.createdAt,
});

export class MongoDcrAdapter implements DcrRepositoryPort {
  async getOrCreate(userId: string, reportDate: string): Promise<Dcr> {
    const key = { userId: new Types.ObjectId(userId), reportDate };
    const upsert = () => DcrModel.findOneAndUpdate(key, { $setOnInsert: { ...key, createdAt: new Date() } }, { upsert: true, new: true }).lean();
    try {
      return toDcr((await upsert())!);
    } catch (err) {
      // Two first records of a day racing: the other created the row — a second pass finds it.
      if ((err as { code?: number }).code !== 11000) throw err;
      return toDcr((await upsert())!);
    }
  }

  async findById(id: string): Promise<Dcr | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await DcrModel.findById(id).lean();
    return doc ? toDcr(doc) : null;
  }

  async findByUserAndDate(userId: string, reportDate: string): Promise<Dcr | null> {
    const doc = await DcrModel.findOne({ userId: new Types.ObjectId(userId), reportDate }).lean();
    return doc ? toDcr(doc) : null;
  }

  async listRange(from: string, to: string): Promise<Dcr[]> {
    return (await DcrModel.find({ reportDate: { $gte: from, $lte: to } }).sort({ reportDate: 1, _id: 1 }).lean()).map(toDcr);
  }

  async listForUsers(userIds: string[], from: string, to: string): Promise<Dcr[]> {
    if (userIds.length === 0) return [];
    const docs = await DcrModel.find({ userId: { $in: userIds.map((id) => new Types.ObjectId(id)) }, reportDate: { $gte: from, $lte: to } })
      .sort({ reportDate: -1, _id: -1 })
      .lean();
    return docs.map(toDcr);
  }
}
