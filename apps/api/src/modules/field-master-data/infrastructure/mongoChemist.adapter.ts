import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Chemist } from '../domain/chemist.entity.js';
import type { ChemistFilter, ChemistRepositoryPort } from '../domain/chemist.repository.port.js';
import { DuplicateRecordError } from '../domain/duplicateRecord.error.js';
import type { PageQuery } from '../domain/masterStatus.js';
import { ChemistModel, type ChemistDoc } from './chemist.schema.js';
import { escapeRegex, isDuplicateKey } from './mongoHelpers.js';

const toChemist = (doc: ChemistDoc & { _id: unknown }): Chemist => ({
  id: String(doc._id),
  routeId: String(doc.routeId),
  name: doc.name,
  address: doc.address,
  location: doc.latitude === null || doc.longitude === null ? null : { latitude: doc.latitude, longitude: doc.longitude },
  capturedLocation:
    doc.capturedLatitude == null || doc.capturedLongitude == null ? null : { latitude: doc.capturedLatitude, longitude: doc.capturedLongitude },
  status: doc.status,
  addedBy: doc.addedBy ? String(doc.addedBy) : null,
  clientRequestId: doc.clientRequestId ?? null,
  approvedAt: doc.approvedAt ?? null,
});

/** Domain `location` ↔ the two stored columns. */
const toColumns = (change: Partial<Omit<Chemist, 'id'>>): Record<string, unknown> => {
  const { location, capturedLocation, routeId, addedBy, ...rest } = change;
  return {
    ...rest,
    ...(routeId !== undefined && { routeId: new Types.ObjectId(routeId) }),
    ...(addedBy !== undefined && { addedBy: addedBy === null ? null : new Types.ObjectId(addedBy) }),
    ...(location !== undefined && { latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }),
    ...(capturedLocation !== undefined && {
      capturedLatitude: capturedLocation?.latitude ?? null,
      capturedLongitude: capturedLocation?.longitude ?? null,
    }),
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

  async listAllActive(): Promise<Chemist[]> {
    return (await ChemistModel.find({ status: 'active' }).sort({ name: 1, _id: 1 }).lean()).map(toChemist);
  }

  async findByIds(ids: string[]): Promise<Chemist[]> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) return [];
    return (await ChemistModel.find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } }).lean()).map(toChemist);
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

  async createProposed(input: Omit<Chemist, 'id'>, ctx: TransactionContext): Promise<Chemist> {
    try {
      const [doc] = await ChemistModel.create([toColumns(input)], { session: ctx as ClientSession });
      return toChemist(doc!.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) throw new DuplicateRecordError('client request');
      throw err;
    }
  }

  async findByClientRequest(addedBy: string, clientRequestId: string): Promise<Chemist | null> {
    const doc = await ChemistModel.findOne({ addedBy: new Types.ObjectId(addedBy), clientRequestId }).lean();
    return doc ? toChemist(doc) : null;
  }

  async listAdded(addedBy: string, page: PageQuery): Promise<PaginatedResult<Chemist>> {
    const query = { addedBy: new Types.ObjectId(addedBy) };
    const [docs, total] = await Promise.all([
      ChemistModel.find(query).sort({ _id: -1 }).skip(toSkipLimit(page).skip).limit(page.pageSize).lean(),
      ChemistModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toChemist), total, page);
  }

  async update(id: string, change: Partial<Omit<Chemist, 'id'>>, ctx?: TransactionContext): Promise<Chemist | null> {
    const doc = await ChemistModel.findByIdAndUpdate(id, toColumns(change), {
      new: true,
      ...(ctx !== undefined && { session: ctx as ClientSession }),
    }).lean();
    return doc ? toChemist(doc) : null;
  }
}
