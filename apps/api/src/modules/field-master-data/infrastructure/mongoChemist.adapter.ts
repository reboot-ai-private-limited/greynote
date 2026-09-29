import { Types } from 'mongoose';
import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Chemist } from '../domain/chemist.entity.js';
import type { ChemistFilter, ChemistRepositoryPort } from '../domain/chemist.repository.port.js';
import { ChemistModel, type ChemistDoc } from './chemist.schema.js';
import { escapeRegex } from './mongoHelpers.js';

const toChemist = (doc: ChemistDoc & { _id: unknown }): Chemist => ({
  id: String(doc._id),
  routeId: String(doc.routeId),
  name: doc.name,
  address: doc.address,
  location: doc.latitude === null || doc.longitude === null ? null : { latitude: doc.latitude, longitude: doc.longitude },
  status: doc.status,
});

/** Domain `location` ↔ the two stored columns. */
const toColumns = (change: Partial<Omit<Chemist, 'id'>>): Record<string, unknown> => {
  const { location, routeId, ...rest } = change;
  return {
    ...rest,
    ...(routeId !== undefined && { routeId: new Types.ObjectId(routeId) }),
    ...(location !== undefined && { latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }),
  };
};

export class MongoChemistAdapter implements ChemistRepositoryPort {
  async list(filter: ChemistFilter): Promise<PaginatedResult<Chemist>> {
    const query: Record<string, unknown> = {};
    if (filter.routeId) query['routeId'] = new Types.ObjectId(filter.routeId);
    if (filter.status) query['status'] = filter.status;
    if (filter.search) query['name'] = new RegExp(escapeRegex(filter.search), 'i');
    const [docs, total] = await Promise.all([
      ChemistModel.find(query).sort({ name: 1, _id: 1 }).skip(toSkipLimit(filter).skip).limit(filter.pageSize).lean(),
      ChemistModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toChemist), total, filter);
  }

  async listActiveOnRoutes(routeIds: string[]): Promise<Chemist[]> {
    if (routeIds.length === 0) return [];
    const docs = await ChemistModel.find({ routeId: { $in: routeIds.map((id) => new Types.ObjectId(id)) }, status: 'active' }).sort({ name: 1, _id: 1 }).lean();
    return docs.map(toChemist);
  }

  async findById(id: string): Promise<Chemist | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ChemistModel.findById(id).lean();
    return doc ? toChemist(doc) : null;
  }

  async create(input: Omit<Chemist, 'id'>): Promise<Chemist> {
    const doc = await ChemistModel.create(toColumns(input));
    return toChemist(doc.toObject());
  }

  async update(id: string, change: Partial<Omit<Chemist, 'id'>>): Promise<Chemist | null> {
    const doc = await ChemistModel.findByIdAndUpdate(id, toColumns(change), { new: true }).lean();
    return doc ? toChemist(doc) : null;
  }
}
