import { Types, type ClientSession, type PipelineStage } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Doctor } from '../domain/doctor.entity.js';
import { DuplicateRecordError } from '../domain/duplicateRecord.error.js';
import type {
  AssignedDoctor,
  AssignedScope,
  DoctorFilter,
  DoctorRepositoryPort,
} from '../domain/doctor.repository.port.js';
import type { PageQuery } from '../domain/masterStatus.js';
import { DoctorModel, type DoctorDoc } from './doctor.schema.js';
import { DoctorAssignmentModel } from './doctorAssignment.schema.js';
import { escapeRegex, isDuplicateKey } from './mongoHelpers.js';

const toDoctor = (doc: DoctorDoc & { _id: unknown }): Doctor => ({
  id: String(doc._id),
  routeId: String(doc.routeId),
  name: doc.name,
  address: doc.address,
  email: doc.email,
  clinicName: doc.clinicName ?? null,
  phone: doc.phone ?? null,
  specialty: doc.specialty,
  qualification: doc.qualification,
  dateOfBirth: doc.dateOfBirth ?? null,
  anniversary: doc.anniversary ?? null,
  visitFrequency: doc.visitFrequency ?? null,
  location: doc.latitude === null || doc.longitude === null ? null : { latitude: doc.latitude, longitude: doc.longitude },
  capturedLocation:
    doc.capturedLatitude === null || doc.capturedLongitude === null ? null : { latitude: doc.capturedLatitude, longitude: doc.capturedLongitude },
  status: doc.status,
  addedBy: String(doc.addedBy),
  clientRequestId: doc.clientRequestId,
  approvedAt: doc.approvedAt,
});

/** Domain fields ↔ the stored columns. */
const toColumns = (change: Partial<Omit<Doctor, 'id'>>): Record<string, unknown> => {
  const { location, capturedLocation, routeId, addedBy, ...rest } = change;
  return {
    ...rest,
    ...(routeId !== undefined && { routeId: new Types.ObjectId(routeId) }),
    ...(addedBy !== undefined && { addedBy: new Types.ObjectId(addedBy) }),
    ...(location !== undefined && { latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }),
    ...(capturedLocation !== undefined && {
      capturedLatitude: capturedLocation?.latitude ?? null,
      capturedLongitude: capturedLocation?.longitude ?? null,
    }),
  };
};

export class MongoDoctorAdapter implements DoctorRepositoryPort {
  async list(filter: DoctorFilter): Promise<PaginatedResult<Doctor>> {
    const query: Record<string, unknown> = {};
    if (filter.routeId) query['routeId'] = new Types.ObjectId(filter.routeId);
    if (filter.status) query['status'] = filter.status;
    if (filter.search) query['name'] = new RegExp(escapeRegex(filter.search), 'i');
    const [docs, total] = await Promise.all([
      DoctorModel.find(query).sort({ name: 1, _id: 1 }).skip(toSkipLimit(filter).skip).limit(filter.pageSize).lean(),
      DoctorModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toDoctor), total, filter);
  }

  async renameSpecialty(from: string, to: string): Promise<number> {
    const res = await DoctorModel.updateMany({ specialty: new RegExp(`^\\s*${escapeRegex(from.trim())}\\s*$`, 'i') }, { $set: { specialty: to } });
    return res.modifiedCount;
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

  async createProposed(input: Omit<Doctor, 'id'>, ctx: TransactionContext): Promise<Doctor> {
    try {
      const [doc] = await DoctorModel.create([toColumns(input)], { session: ctx as ClientSession });
      return toDoctor(doc!.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) throw new DuplicateRecordError('client request');
      throw err;
    }
  }

  async findByClientRequest(addedBy: string, clientRequestId: string): Promise<Doctor | null> {
    const doc = await DoctorModel.findOne({ addedBy: new Types.ObjectId(addedBy), clientRequestId }).lean();
    return doc ? toDoctor(doc) : null;
  }

  async update(id: string, change: Partial<Omit<Doctor, 'id'>>, ctx?: TransactionContext): Promise<Doctor | null> {
    const doc = await DoctorModel.findByIdAndUpdate(id, toColumns(change), {
      new: true,
      ...(ctx !== undefined && { session: ctx as ClientSession }),
    }).lean();
    return doc ? toDoctor(doc) : null;
  }

  async listPendingAdded(addedBy: string): Promise<Doctor[]> {
    const docs = await DoctorModel.find({ addedBy: new Types.ObjectId(addedBy), status: 'pending' }).sort({ _id: 1 }).lean();
    return docs.map(toDoctor);
  }

  async listAdded(addedBy: string, page: PageQuery): Promise<PaginatedResult<Doctor>> {
    const query = { addedBy: new Types.ObjectId(addedBy) };
    const [docs, total] = await Promise.all([
      DoctorModel.find(query).sort({ _id: -1 }).skip(toSkipLimit(page).skip).limit(page.pageSize).lean(),
      DoctorModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toDoctor), total, page);
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
