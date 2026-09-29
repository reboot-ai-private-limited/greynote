import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DoctorAssignment } from '../domain/doctorAssignment.entity.js';
import { DuplicateRecordError } from '../domain/duplicateRecord.error.js';
import type { DoctorAssignmentRepositoryPort } from '../domain/doctorAssignment.repository.port.js';
import { DoctorAssignmentModel, type DoctorAssignmentDoc } from './doctorAssignment.schema.js';
import { isDuplicateKey } from './mongoHelpers.js';

const toAssignment = (doc: DoctorAssignmentDoc & { _id: unknown }): DoctorAssignment => ({
  id: String(doc._id),
  doctorId: String(doc.doctorId),
  userId: String(doc.userId),
  status: doc.status,
  assignedAt: doc.assignedAt,
  assignedBy: String(doc.assignedBy),
  unassignedAt: doc.unassignedAt,
  unassignedBy: doc.unassignedBy === null ? null : String(doc.unassignedBy),
});

const session = (ctx: TransactionContext) => ctx as ClientSession;
const oid = (id: string) => new Types.ObjectId(id);
const ending = (by: string) => ({ status: 'inactive' as const, unassignedAt: new Date(), unassignedBy: oid(by) });

export class MongoDoctorAssignmentAdapter implements DoctorAssignmentRepositoryPort {
  async findActiveForDoctor(doctorId: string): Promise<DoctorAssignment | null> {
    const doc = await DoctorAssignmentModel.findOne({ doctorId: oid(doctorId), status: 'active' }).lean();
    return doc ? toAssignment(doc) : null;
  }

  async findActiveForDoctors(doctorIds: string[]): Promise<DoctorAssignment[]> {
    if (doctorIds.length === 0) return [];
    const docs = await DoctorAssignmentModel.find({ doctorId: { $in: doctorIds.map(oid) }, status: 'active' }).lean();
    return docs.map(toAssignment);
  }

  async listForDoctor(doctorId: string): Promise<DoctorAssignment[]> {
    return (await DoctorAssignmentModel.find({ doctorId: oid(doctorId) }).sort({ assignedAt: -1, _id: -1 }).lean()).map(toAssignment);
  }

  async endActive(doctorId: string, by: string, ctx: TransactionContext): Promise<void> {
    await DoctorAssignmentModel.updateOne({ doctorId: oid(doctorId), status: 'active' }, ending(by), { session: session(ctx) });
  }

  async create(input: { doctorId: string; userId: string; assignedBy: string }, ctx: TransactionContext): Promise<DoctorAssignment> {
    try {
      const [doc] = await DoctorAssignmentModel.create(
        [{ doctorId: oid(input.doctorId), userId: oid(input.userId), status: 'active', assignedAt: new Date(), assignedBy: oid(input.assignedBy) }],
        { session: session(ctx) },
      );
      return toAssignment(doc!.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) throw new DuplicateRecordError('active assignment');
      throw err;
    }
  }

  async endActiveIfUser(doctorId: string, userId: string, by: string): Promise<boolean> {
    const result = await DoctorAssignmentModel.updateOne({ doctorId: oid(doctorId), userId: oid(userId), status: 'active' }, ending(by));
    return result.matchedCount === 1;
  }
}
