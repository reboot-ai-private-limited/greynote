import { Types } from 'mongoose';
import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { CoverageScope, Distributor, DistributorDocument } from '../domain/distributor.entity.js';
import type { DistributorFilter, DistributorRepositoryPort } from '../domain/distributor.repository.port.js';
import { DistributorModel, type DistributorDoc } from './distributor.schema.js';
import { escapeRegex } from './mongoHelpers.js';

const toDistributor = (doc: DistributorDoc & { _id: unknown }): Distributor => ({
  id: String(doc._id),
  zoneIds: (doc.zoneIds ?? []).map(String),
  hqIds: (doc.hqIds ?? []).map(String),
  routeIds: (doc.routeIds ?? []).map(String),
  name: doc.name,
  gstNumber: doc.gstNumber,
  contactPerson: doc.contactPerson,
  mobile: doc.mobile,
  address: doc.address,
  location: doc.latitude === null || doc.longitude === null ? null : { latitude: doc.latitude, longitude: doc.longitude },
  assignedUserIds: (doc.assignedUserIds ?? []).map(String),
  documents: (doc.documents ?? []).map((d) => ({ id: d.id, type: d.type, url: d.url, publicId: d.publicId, uploadedAt: d.uploadedAt })),
  openingDuesPaise: doc.openingDuesPaise ?? 0,
  status: doc.status,
});

/** Domain fields ↔ the stored columns. */
const oids = (ids: string[]) => ids.map((id) => new Types.ObjectId(id));

/** Matches a distributor whose coverage meets any of these places; each field of a scope is one way in. */
const coverageClauses = (scope: CoverageScope): Record<string, unknown>[] => [
  ...(scope.zoneIds.length > 0 ? [{ zoneIds: { $in: oids(scope.zoneIds) } }] : []),
  ...(scope.hqIds.length > 0 ? [{ hqIds: { $in: oids(scope.hqIds) } }] : []),
  ...(scope.routeIds.length > 0 ? [{ routeIds: { $in: oids(scope.routeIds) } }] : []),
];

const toColumns = (change: Partial<Omit<Distributor, 'id'>>): Record<string, unknown> => {
  const { location, zoneIds, hqIds, routeIds, assignedUserIds, documents: _documents, ...rest } = change;
  return {
    ...rest,
    ...(zoneIds !== undefined && { zoneIds: oids(zoneIds) }),
    ...(hqIds !== undefined && { hqIds: oids(hqIds) }),
    ...(routeIds !== undefined && { routeIds: routeIds.map((id) => new Types.ObjectId(id)) }),
    ...(assignedUserIds !== undefined && { assignedUserIds: assignedUserIds.map((id) => new Types.ObjectId(id)) }),
    ...(location !== undefined && { latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }),
  };
};

export class MongoDistributorAdapter implements DistributorRepositoryPort {
  countAssignee(userId: string): Promise<number> {
    return DistributorModel.countDocuments({ assignedUserIds: new Types.ObjectId(userId) });
  }

  async removeAssignee(userId: string): Promise<number> {
    const id = new Types.ObjectId(userId);
    return (await DistributorModel.updateMany({ assignedUserIds: id }, { $pull: { assignedUserIds: id } })).modifiedCount;
  }

  async list(filter: DistributorFilter): Promise<PaginatedResult<Distributor>> {
    const query: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];
    if (filter.scope) {
      const clauses = coverageClauses(filter.scope);
      if (clauses.length === 0) return buildPaginatedResult([], 0, filter);
      and.push({ $or: clauses });
    }
    if (filter.assignedUserId) query['assignedUserIds'] = new Types.ObjectId(filter.assignedUserId);
    if (filter.status) query['status'] = filter.status;
    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search), 'i');
      and.push({ $or: [{ name: rx }, { gstNumber: rx }, { contactPerson: rx }] });
    }
    if (and.length > 0) query['$and'] = and;
    const [docs, total] = await Promise.all([
      DistributorModel.find(query).sort({ name: 1, _id: 1 }).skip(toSkipLimit(filter).skip).limit(filter.pageSize).lean(),
      DistributorModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toDistributor), total, filter);
  }

  async listActiveForUser(userId: string, scope: CoverageScope): Promise<Distributor[]> {
    const docs = await DistributorModel.find({
      status: 'active',
      $or: [{ assignedUserIds: new Types.ObjectId(userId) }, ...coverageClauses(scope)],
    })
      .sort({ name: 1, _id: 1 })
      .lean();
    return docs.map(toDistributor);
  }

  async listAllActive(): Promise<Distributor[]> {
    return (await DistributorModel.find({ status: 'active' }).sort({ name: 1, _id: 1 }).lean()).map(toDistributor);
  }

  async findByIds(ids: string[]): Promise<Distributor[]> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) return [];
    return (await DistributorModel.find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } }).lean()).map(toDistributor);
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

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    return (await DistributorModel.deleteOne({ _id: id })).deletedCount > 0;
  }

  async addDocument(id: string, document: DistributorDocument): Promise<Distributor | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await DistributorModel.findByIdAndUpdate(id, { $push: { documents: document } }, { new: true }).lean();
    return doc ? toDistributor(doc) : null;
  }

  async removeDocument(id: string, documentId: string): Promise<DistributorDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const before = await DistributorModel.findOneAndUpdate({ _id: id, 'documents.id': documentId }, { $pull: { documents: { id: documentId } } }).lean();
    return before?.documents?.find((d) => d.id === documentId) ?? null;
  }
}
