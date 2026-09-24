import { AppError } from '@/shared/errors/AppError.js';
import type { TerritoryListQuery } from '../domain/territoryStatus.js';
import type { Zone } from '../domain/zone.entity.js';
import type { ZoneRepositoryPort } from '../domain/zone.repository.port.js';
import { listOptions, rethrowDuplicateName, toNameKey } from './mongoHelpers.js';
import { ZoneModel, type ZoneDoc } from './zone.schema.js';

function toZone(doc: ZoneDoc & { _id: unknown }): Zone {
  return { id: String(doc._id), name: doc.name, status: doc.status };
}

export class MongoZoneAdapter implements ZoneRepositoryPort {
  async findById(id: string): Promise<Zone | null> {
    const doc = await ZoneModel.findById(id).lean();
    return doc ? toZone(doc) : null;
  }

  async findByName(name: string): Promise<Zone | null> {
    const doc = await ZoneModel.findOne({ nameKey: toNameKey(name) }).lean();
    return doc ? toZone(doc) : null;
  }

  async list(query: TerritoryListQuery): Promise<{ items: Zone[]; total: number }> {
    const { filter, sort, skip, limit } = listOptions<ZoneDoc>(query);
    const [docs, total] = await Promise.all([
      ZoneModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      ZoneModel.countDocuments(filter),
    ]);
    return { items: docs.map(toZone), total };
  }

  async create(input: Omit<Zone, 'id'>): Promise<Zone> {
    try {
      const doc = await ZoneModel.create({ ...input, nameKey: toNameKey(input.name) });
      return toZone(doc.toObject());
    } catch (err) {
      return rethrowDuplicateName(err, 'zone');
    }
  }

  async update(id: string, input: Partial<Omit<Zone, 'id'>>): Promise<Zone> {
    const change = input.name === undefined ? input : { ...input, nameKey: toNameKey(input.name) };
    try {
      const doc = await ZoneModel.findByIdAndUpdate(id, change, { new: true }).lean();
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'ZONE_NOT_FOUND', id });
      return toZone(doc);
    } catch (err) {
      return rethrowDuplicateName(err, 'zone');
    }
  }
}
