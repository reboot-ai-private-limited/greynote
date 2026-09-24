import { Types } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { Hq } from '../domain/hq.entity.js';
import type { HqRepositoryPort } from '../domain/hq.repository.port.js';
import type { TerritoryListQuery } from '../domain/territoryStatus.js';
import { HqModel, type HqDoc } from './hq.schema.js';
import { listOptions, rethrowDuplicateName, toNameKey } from './mongoHelpers.js';

function toHq(doc: HqDoc & { _id: unknown }): Hq {
  return { id: String(doc._id), zoneId: String(doc.zoneId), name: doc.name, status: doc.status };
}

export class MongoHqAdapter implements HqRepositoryPort {
  async findById(id: string): Promise<Hq | null> {
    const doc = await HqModel.findById(id).lean();
    return doc ? toHq(doc) : null;
  }

  async findByName(zoneId: string, name: string): Promise<Hq | null> {
    const doc = await HqModel.findOne({ zoneId: new Types.ObjectId(zoneId), nameKey: toNameKey(name) }).lean();
    return doc ? toHq(doc) : null;
  }

  async list(query: TerritoryListQuery & { zoneId?: string | undefined }): Promise<{ items: Hq[]; total: number }> {
    const { filter, sort, skip, limit } = listOptions<HqDoc>(query);
    if (query.zoneId) filter.zoneId = new Types.ObjectId(query.zoneId);
    const [docs, total] = await Promise.all([
      HqModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      HqModel.countDocuments(filter),
    ]);
    return { items: docs.map(toHq), total };
  }

  countActiveInZone(zoneId: string): Promise<number> {
    return HqModel.countDocuments({ zoneId: new Types.ObjectId(zoneId), status: 'active' });
  }

  async create(input: Omit<Hq, 'id'>): Promise<Hq> {
    try {
      const doc = await HqModel.create({
        ...input,
        zoneId: new Types.ObjectId(input.zoneId),
        nameKey: toNameKey(input.name),
      });
      return toHq(doc.toObject());
    } catch (err) {
      return rethrowDuplicateName(err, 'HQ');
    }
  }

  async update(id: string, input: Partial<Omit<Hq, 'id' | 'zoneId'>>): Promise<Hq> {
    const change = input.name === undefined ? input : { ...input, nameKey: toNameKey(input.name) };
    try {
      const doc = await HqModel.findByIdAndUpdate(id, change, { new: true }).lean();
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'HQ_NOT_FOUND', id });
      return toHq(doc);
    } catch (err) {
      return rethrowDuplicateName(err, 'HQ');
    }
  }
}
