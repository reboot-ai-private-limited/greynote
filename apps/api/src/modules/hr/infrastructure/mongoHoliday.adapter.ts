import { Types } from 'mongoose';
import type { Holiday } from '../domain/holiday.entity.js';
import type { HolidayFilter, HolidayRepositoryPort } from '../domain/holiday.repository.port.js';
import { HolidayModel, type HolidayDoc } from './holiday.schema.js';

const toHoliday = (doc: HolidayDoc & { _id: unknown }): Holiday => ({
  id: String(doc._id),
  name: doc.name,
  date: doc.date,
  scope: doc.scope,
  zoneIds: doc.zoneIds.map(String),
  hqIds: doc.hqIds.map(String),
  createdBy: String(doc.createdBy),
  createdAt: doc.createdAt,
});

export class MongoHolidayAdapter implements HolidayRepositoryPort {
  async findById(id: string): Promise<Holiday | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await HolidayModel.findById(id).lean();
    return doc ? toHoliday(doc) : null;
  }

  async list(filter: HolidayFilter): Promise<Holiday[]> {
    const docs = await HolidayModel.find({
      date: { $gte: filter.from, $lte: filter.to },
      ...(filter.scope && { scope: filter.scope }),
      ...(filter.zoneId && { zoneIds: new Types.ObjectId(filter.zoneId) }),
      ...(filter.hqId && { hqIds: new Types.ObjectId(filter.hqId) }),
    })
      .sort({ date: 1, name: 1 })
      .lean();
    return docs.map(toHoliday);
  }

  async listApplicable(from: string, to: string, place: { hqIds: string[]; zoneIds: string[] } | null): Promise<Holiday[]> {
    const scopes: Record<string, unknown>[] = [{ scope: 'NATIONAL' }];
    if (place) {
      scopes.push({ scope: 'ZONE', zoneIds: { $in: place.zoneIds.map((id) => new Types.ObjectId(id)) } });
      scopes.push({ scope: 'HQ', hqIds: { $in: place.hqIds.map((id) => new Types.ObjectId(id)) } });
    }
    const docs = await HolidayModel.find({ date: { $gte: from, $lte: to }, $or: scopes }).sort({ date: 1, name: 1 }).lean();
    return docs.map(toHoliday);
  }

  async create(input: Omit<Holiday, 'id' | 'createdAt'>): Promise<Holiday> {
    const doc = await HolidayModel.create({
      ...input,
      zoneIds: input.zoneIds.map((id) => new Types.ObjectId(id)),
      hqIds: input.hqIds.map((id) => new Types.ObjectId(id)),
      createdBy: new Types.ObjectId(input.createdBy),
      createdAt: new Date(),
    });
    return toHoliday(doc.toObject());
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    return (await HolidayModel.deleteOne({ _id: id })).deletedCount === 1;
  }
}
