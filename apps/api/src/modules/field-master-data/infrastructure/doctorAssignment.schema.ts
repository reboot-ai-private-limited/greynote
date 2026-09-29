import { Schema, model, type Types } from 'mongoose';

export interface DoctorAssignmentDoc {
  doctorId: Types.ObjectId;
  userId: Types.ObjectId;
  status: 'active' | 'inactive';
  assignedAt: Date;
  assignedBy: Types.ObjectId;
  unassignedAt: Date | null;
  unassignedBy: Types.ObjectId | null;
}

const doctorAssignmentSchema = new Schema<DoctorAssignmentDoc>({
  doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'Doctor' },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  status: { type: String, required: true, enum: ['active', 'inactive'] },
  assignedAt: { type: Date, required: true },
  assignedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  unassignedAt: { type: Date, default: null },
  unassignedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
});

// One active row per Doctor, enforced by the database so two racing reassignments can't both win.
doctorAssignmentSchema.index({ doctorId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
// "This MR's Doctors" and the history list.
doctorAssignmentSchema.index({ userId: 1, status: 1 });
doctorAssignmentSchema.index({ doctorId: 1, assignedAt: -1 });

export const DoctorAssignmentModel = model<DoctorAssignmentDoc>('DoctorAssignment', doctorAssignmentSchema);
