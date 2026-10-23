import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Doctor } from '../domain/doctor.entity.js';
import type { DoctorArchivePort } from '../domain/doctorRetirement.js';
import { DoctorArchiveModel } from './doctorArchive.schema.js';
import { DoctorModel } from './doctor.schema.js';
import { DoctorAssignmentModel } from './doctorAssignment.schema.js';
import { toDoctor } from './mongoDoctor.adapter.js';

const oid = (id: string) => new Types.ObjectId(id);

export class MongoDoctorArchiveAdapter implements DoctorArchivePort {
  async remove(doctor: Doctor, lastAssignedUserId: string | null, actorId: string, ctx: TransactionContext): Promise<void> {
    const session = ctx as ClientSession;
    const row = await DoctorModel.findById(doctor.id).session(session).lean();
    if (!row) return;
    const { _id, ...stored } = row;
    await DoctorArchiveModel.create(
      [{ originalId: _id, doctor: { ...stored, photo: null }, lastAssignedUserId: lastAssignedUserId ? oid(lastAssignedUserId) : null, deletedBy: oid(actorId), deletedAt: new Date() }],
      { session },
    );
    await DoctorAssignmentModel.deleteMany({ doctorId: _id }, { session });
    await DoctorModel.deleteOne({ _id }, { session });
  }

  async findArchived(id: string): Promise<Doctor | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await DoctorArchiveModel.findOne({ originalId: oid(id) }).lean();
    return doc ? { ...toDoctor({ ...doc.doctor, _id: doc.originalId }), status: 'inactive' } : null;
  }
}
