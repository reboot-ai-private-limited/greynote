import { Schema, model, type Types } from 'mongoose';
import type { DoctorDoc } from './doctor.schema.js';

/** A permanently deleted Doctor (decision-log 2026-10-22): the row as it was, so history still resolves its id. */
export interface DoctorArchiveDoc {
  originalId: Types.ObjectId;
  doctor: DoctorDoc;
  lastAssignedUserId: Types.ObjectId | null;
  deletedBy: Types.ObjectId;
  deletedAt: Date;
}

const doctorArchiveSchema = new Schema<DoctorArchiveDoc>({
  originalId: { type: Schema.Types.ObjectId, required: true },
  // The whole stored row, unchanged: whatever fields a Doctor had at the time.
  doctor: { type: Schema.Types.Mixed, required: true },
  lastAssignedUserId: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  deletedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  deletedAt: { type: Date, required: true },
});
doctorArchiveSchema.index({ originalId: 1 }, { unique: true });

export const DoctorArchiveModel = model<DoctorArchiveDoc>('DoctorArchive', doctorArchiveSchema);
