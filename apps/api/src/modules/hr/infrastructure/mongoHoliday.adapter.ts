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
  groupId: doc.groupId ?? null,
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

  async countScopedTo(scope: { zoneIds: string[]; hqIds: string[] }): Promise<number> {
    const toIds = (ids: string[]) => ids.map((id) => new Types.ObjectId(id));
    return HolidayModel.countDocuments({
      $or: [
        { scope: 'ZONE', zoneIds: { $in: toIds(scope.zoneIds) } },
        { scope: 'HQ', hqIds: { $in: toIds(scope.hqIds) } },
      ],
    });
  }

  async create(input: Omit<Holiday, 'id' | 'createdAt'>): Promise<Holiday> {
    const [created] = await this.createMany([input]);
    return created!;
  }

  async createMany(inputs: Omit<Holiday, 'id' | 'createdAt'>[]): Promise<Holiday[]> {
    const createdAt = new Date();
    // Mongoose validates every row before inserting any; `ordered` keeps the days in the order given.
    const docs = await HolidayModel.insertMany(
      inputs.map((input) => ({
        ...input,
        zoneIds: input.zoneIds.map((id) => new Types.ObjectId(id)),
        hqIds: input.hqIds.map((id) => new Types.ObjectId(id)),
        createdBy: new Types.ObjectId(input.createdBy),
        createdAt,
      })),
      { ordered: true },
    );
    return docs.map((doc) => toHoliday(doc.toObject()));
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    return (await HolidayModel.deleteOne({ _id: id })).deletedCount === 1;
  }

  async deleteGroup(groupId: string): Promise<number> {
    return (await HolidayModel.deleteMany({ groupId })).deletedCount;
  }
}
