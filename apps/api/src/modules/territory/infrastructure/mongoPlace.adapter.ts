import { Types } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { Place } from '../domain/place.entity.js';
import type { PlaceListQuery, PlaceRepositoryPort } from '../domain/place.repository.port.js';
import { HqModel } from './hq.schema.js';
import { listOptions, rethrowDuplicateName, toNameKey } from './mongoHelpers.js';
import { PlaceModel, type PlaceDoc } from './place.schema.js';

function toPlace(doc: PlaceDoc & { _id: unknown }): Place {
  return {
    id: String(doc._id),
    hqId: String(doc.hqId),
    name: doc.name,
    type: doc.type,
    isHqTown: doc.isHqTown === true,
    status: doc.status,
  };
}

export class MongoPlaceAdapter implements PlaceRepositoryPort {
  async findById(id: string): Promise<Place | null> {
    const doc = await PlaceModel.findById(id).lean();
    return doc ? toPlace(doc) : null;
  }

  async findByIds(ids: string[]): Promise<Place[]> {
    if (ids.length === 0) return [];
    const docs = await PlaceModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } }).lean();
    return docs.map(toPlace);
  }

  async findByName(hqId: string, name: string): Promise<Place | null> {
    const doc = await PlaceModel.findOne({ hqId: new Types.ObjectId(hqId), nameKey: toNameKey(name) }).lean();
    return doc ? toPlace(doc) : null;
  }

  async findHqTown(hqId: string): Promise<Place | null> {
    const doc = await PlaceModel.findOne({ hqId: new Types.ObjectId(hqId), isHqTown: true }).lean();
    return doc ? toPlace(doc) : null;
  }

  async list(query: PlaceListQuery): Promise<{ items: Place[]; total: number }> {
    const { filter, sort, skip, limit } = listOptions<PlaceDoc>(query);
    if (query.hqId) {
      filter.hqId = new Types.ObjectId(query.hqId);
    } else if (query.zoneId) {
      const hqIds = (await HqModel.find({ zoneId: new Types.ObjectId(query.zoneId) }).select('_id').lean()).map((h) => h._id);
      filter.hqId = { $in: hqIds };
    }
    if (query.type) filter.type = query.type;
    // The HQ town first in every list, then by name.
    const [docs, total] = await Promise.all([
      PlaceModel.find(filter).sort({ isHqTown: -1, ...sort }).skip(skip).limit(limit).lean(),
      PlaceModel.countDocuments(filter),
    ]);
    return { items: docs.map(toPlace), total };
  }

  countActiveOutsideTownInHq(hqId: string): Promise<number> {
    return PlaceModel.countDocuments({ hqId: new Types.ObjectId(hqId), status: 'active', isHqTown: { $ne: true } });
  }

  async create(input: Omit<Place, 'id'>): Promise<Place> {
    try {
      const doc = await PlaceModel.create({ ...input, hqId: new Types.ObjectId(input.hqId), nameKey: toNameKey(input.name) });
      return toPlace(doc.toObject());
    } catch (err) {
      return rethrowDuplicateName(err, 'place');
    }
  }

  async delete(id: string): Promise<void> {
    await PlaceModel.deleteOne({ _id: new Types.ObjectId(id) });
  }

  async update(id: string, input: Partial<Pick<Place, 'name' | 'type' | 'status'>>): Promise<Place> {
    const change = input.name === undefined ? input : { ...input, nameKey: toNameKey(input.name) };
    try {
      const doc = await PlaceModel.findByIdAndUpdate(id, change, { new: true }).lean();
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'PLACE_NOT_FOUND', id });
      return toPlace(doc);
    } catch (err) {
      return rethrowDuplicateName(err, 'place');
    }
  }
}
