import { Types } from 'mongoose';
import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Distributor } from '../domain/distributor.entity.js';
import type { DistributorFilter, DistributorRepositoryPort } from '../domain/distributor.repository.port.js';
import { DistributorModel, type DistributorDoc } from './distributor.schema.js';
import { escapeRegex } from './mongoHelpers.js';

const idOrNull = (id: unknown) => (id ? String(id) : null);

const toDistributor = (doc: DistributorDoc & { _id: unknown }): Distributor => ({
  id: String(doc._id),
  routeId: String(doc.routeId),
  name: doc.name,
  gstNumber: doc.gstNumber,
  contactPerson: doc.contactPerson,
  mobile: doc.mobile,
  address: doc.address,
  location: doc.latitude === null || doc.longitude === null ? null : { latitude: doc.latitude, longitude: doc.longitude },
  assignedMrId: idOrNull(doc.assignedMrId),
  assignedAsmId: idOrNull(doc.assignedAsmId),
  primarySalesEnabled: doc.primarySalesEnabled,
  secondarySalesEnabled: doc.secondarySalesEnabled,
  status: doc.status,
});

const oid = (id: string | null) => (id === null ? null : new Types.ObjectId(id));

/** Domain fields ↔ the stored columns. */
const toColumns = (change: Partial<Omit<Distributor, 'id'>>): Record<string, unknown> => {
  const { location, routeId, assignedMrId, assignedAsmId, ...rest } = change;
  return {
    ...rest,
    ...(routeId !== undefined && { routeId: new Types.ObjectId(routeId) }),
    ...(assignedMrId !== undefined && { assignedMrId: oid(assignedMrId) }),
    ...(assignedAsmId !== undefined && { assignedAsmId: oid(assignedAsmId) }),
    ...(location !== undefined && { latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }),
  };
};

export class MongoDistributorAdapter implements DistributorRepositoryPort {
  async list(filter: DistributorFilter): Promise<PaginatedResult<Distributor>> {
    const query: Record<string, unknown> = {};
    if (filter.routeIds) query['routeId'] = { $in: filter.routeIds.map((id) => new Types.ObjectId(id)) };
    if (filter.assignedMrId) query['assignedMrId'] = new Types.ObjectId(filter.assignedMrId);
    if (filter.status) query['status'] = filter.status;
    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search), 'i');
      query['$or'] = [{ name: rx }, { gstNumber: rx }, { contactPerson: rx }];
    }
    const [docs, total] = await Promise.all([
      DistributorModel.find(query).sort({ name: 1, _id: 1 }).skip(toSkipLimit(filter).skip).limit(filter.pageSize).lean(),
      DistributorModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toDistributor), total, filter);
  }

  async listActiveForUser(userId: string, routeIds: string[]): Promise<Distributor[]> {
    const docs = await DistributorModel.find({
      status: 'active',
      $or: [{ assignedMrId: new Types.ObjectId(userId) }, { routeId: { $in: routeIds.map((id) => new Types.ObjectId(id)) } }],
    })
      .sort({ name: 1, _id: 1 })
      .lean();
    return docs.map(toDistributor);
  }

  async findById(id: string): Promise<Distributor | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await DistributorModel.findById(id).lean();
    return doc ? toDistributor(doc) : null;
  }

  async create(input: Omit<Distributor, 'id'>): Promise<Distributor> {
    const doc = await DistributorModel.create(toColumns(input));
    return toDistributor(doc.toObject());
  }

  async update(id: string, change: Partial<Omit<Distributor, 'id'>>): Promise<Distributor | null> {
    const doc = await DistributorModel.findByIdAndUpdate(id, toColumns(change), { new: true }).lean();
    return doc ? toDistributor(doc) : null;
  }
}
