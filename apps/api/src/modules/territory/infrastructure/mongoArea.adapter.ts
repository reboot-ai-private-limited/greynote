import { Types } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { Area, AreaType } from '../domain/area.entity.js';
import type { AreaRepositoryPort } from '../domain/area.repository.port.js';
import type { TerritoryListQuery } from '../domain/territoryStatus.js';
import { AreaModel, type AreaDoc } from './area.schema.js';
import { listOptions, rethrowDuplicateName, toNameKey } from './mongoHelpers.js';

function toArea(doc: AreaDoc & { _id: unknown }): Area {
  return { id: String(doc._id), hqId: String(doc.hqId), name: doc.name, type: doc.type, status: doc.status };
}

export class MongoAreaAdapter implements AreaRepositoryPort {
  async findById(id: string): Promise<Area | null> {
    const doc = await AreaModel.findById(id).lean();
    return doc ? toArea(doc) : null;
  }

  async findByName(hqId: string, name: string): Promise<Area | null> {
    const doc = await AreaModel.findOne({ hqId: new Types.ObjectId(hqId), nameKey: toNameKey(name) }).lean();
    return doc ? toArea(doc) : null;
  }

  async list(
    query: TerritoryListQuery & { hqId?: string | undefined; type?: AreaType | undefined },
  ): Promise<{ items: Area[]; total: number }> {
    const { filter, sort, skip, limit } = listOptions<AreaDoc>(query);
    if (query.hqId) filter.hqId = new Types.ObjectId(query.hqId);
    if (query.type) filter.type = query.type;
    const [docs, total] = await Promise.all([
      AreaModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      AreaModel.countDocuments(filter),
    ]);
    return { items: docs.map(toArea), total };
  }

  countActiveInHq(hqId: string): Promise<number> {
    return AreaModel.countDocuments({ hqId: new Types.ObjectId(hqId), status: 'active' });
  }

  async create(input: Omit<Area, 'id'>): Promise<Area> {
    try {
      const doc = await AreaModel.create({
        ...input,
        hqId: new Types.ObjectId(input.hqId),
        nameKey: toNameKey(input.name),
      });
      return toArea(doc.toObject());
    } catch (err) {
      return rethrowDuplicateName(err, 'area');
    }
  }

  async update(id: string, input: Partial<Omit<Area, 'id' | 'hqId'>>): Promise<Area> {
    const change = input.name === undefined ? input : { ...input, nameKey: toNameKey(input.name) };
    try {
      const doc = await AreaModel.findByIdAndUpdate(id, change, { new: true }).lean();
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'AREA_NOT_FOUND', id });
      return toArea(doc);
    } catch (err) {
      return rethrowDuplicateName(err, 'area');
    }
  }
}
