import { Types, type PipelineStage } from 'mongoose';
import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Doctor } from '../domain/doctor.entity.js';
import type {
  AssignedDoctor,
  AssignedScope,
  DoctorFilter,
  DoctorRepositoryPort,
} from '../domain/doctor.repository.port.js';
import type { PageQuery } from '../domain/masterStatus.js';
import { DoctorModel, type DoctorDoc } from './doctor.schema.js';
import { DoctorAssignmentModel } from './doctorAssignment.schema.js';
import { escapeRegex } from './mongoHelpers.js';

const toDoctor = (doc: DoctorDoc & { _id: unknown }): Doctor => ({
  id: String(doc._id),
  routeId: String(doc.routeId),
  category: doc.category,
  name: doc.name,
  address: doc.address,
  email: doc.email,
  specialty: doc.specialty,
  qualification: doc.qualification,
  location: doc.latitude === null || doc.longitude === null ? null : { latitude: doc.latitude, longitude: doc.longitude },
  status: doc.status,
  addedBy: String(doc.addedBy),
  approvedAt: doc.approvedAt,
});

/** Domain fields ↔ the stored columns. */
const toColumns = (change: Partial<Omit<Doctor, 'id'>>): Record<string, unknown> => {
  const { location, routeId, addedBy, ...rest } = change;
  return {
    ...rest,
    ...(routeId !== undefined && { routeId: new Types.ObjectId(routeId) }),
    ...(addedBy !== undefined && { addedBy: new Types.ObjectId(addedBy) }),
    ...(location !== undefined && { latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }),
  };
};

export class MongoDoctorAdapter implements DoctorRepositoryPort {
  async list(filter: DoctorFilter): Promise<PaginatedResult<Doctor>> {
    const query: Record<string, unknown> = {};
    if (filter.routeId) query['routeId'] = new Types.ObjectId(filter.routeId);
    if (filter.category) query['category'] = filter.category;
    if (filter.status) query['status'] = filter.status;
    if (filter.search) query['name'] = new RegExp(escapeRegex(filter.search), 'i');
    const [docs, total] = await Promise.all([
      DoctorModel.find(query).sort({ name: 1, _id: 1 }).skip(toSkipLimit(filter).skip).limit(filter.pageSize).lean(),
      DoctorModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toDoctor), total, filter);
  }

  async findById(id: string): Promise<Doctor | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await DoctorModel.findById(id).lean();
    return doc ? toDoctor(doc) : null;
  }

  async create(input: Omit<Doctor, 'id'>): Promise<Doctor> {
    const doc = await DoctorModel.create(toColumns(input));
    return toDoctor(doc.toObject());
  }

  async update(id: string, change: Partial<Omit<Doctor, 'id'>>): Promise<Doctor | null> {
    const doc = await DoctorModel.findByIdAndUpdate(id, toColumns(change), { new: true }).lean();
    return doc ? toDoctor(doc) : null;
  }

  async listAssigned(
    scopes: AssignedScope[],
    filter: Omit<DoctorFilter, 'status' | keyof PageQuery>,
    page: PageQuery | null,
  ): Promise<{ items: AssignedDoctor[]; total: number }> {
    if (scopes.length === 0) return { items: [], total: 0 };
    const oid = (id: string) => new Types.ObjectId(id);

    const doctorMatch: Record<string, unknown> = { 'doctor.status': 'active' };
    if (filter.routeId) doctorMatch['doctor.routeId'] = oid(filter.routeId);
    if (filter.category) doctorMatch['doctor.category'] = filter.category;
    if (filter.search) doctorMatch['doctor.name'] = new RegExp(escapeRegex(filter.search), 'i');
    // When visibility follows the Route, a user's Doctors are only the ones on Routes they still have.
    if (scopes.some((s) => s.routeIds !== null)) {
      doctorMatch['$or'] = scopes.map((s) => ({
        userId: oid(s.userId),
        ...(s.routeIds !== null && { 'doctor.routeId': { $in: s.routeIds.map(oid) } }),
      }));
    }

    const pipeline: PipelineStage[] = [
      { $match: { status: 'active', userId: { $in: scopes.map((s) => oid(s.userId)) } } },
      { $lookup: { from: DoctorModel.collection.name, localField: 'doctorId', foreignField: '_id', as: 'doctor' } },
      { $unwind: '$doctor' },
      { $match: doctorMatch },
      { $sort: { 'doctor.name': 1, _id: 1 } },
    ];
    type Row = { userId: Types.ObjectId; doctor: DoctorDoc & { _id: unknown } };
    const toAssigned = (r: Row): AssignedDoctor => ({ ...toDoctor(r.doctor), assignedUserId: String(r.userId) });

    if (!page) {
      const all = await DoctorAssignmentModel.aggregate<Row>(pipeline);
      return { items: all.map(toAssigned), total: all.length };
    }
    const [result] = await DoctorAssignmentModel.aggregate<{ items: Row[]; total: Array<{ n: number }> }>([
      ...pipeline,
      { $facet: { items: [{ $skip: toSkipLimit(page).skip }, { $limit: page.pageSize }], total: [{ $count: 'n' }] } },
    ]);
    return { items: (result?.items ?? []).map(toAssigned), total: result?.total[0]?.n ?? 0 };
  }
}
