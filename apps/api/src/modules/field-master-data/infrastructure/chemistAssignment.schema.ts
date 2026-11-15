import { Schema, model, type Types } from 'mongoose';

export interface ChemistAssignmentDoc {
  chemistId: Types.ObjectId;
  userId: Types.ObjectId;
  status: 'active' | 'inactive';
  assignedAt: Date;
  assignedBy: Types.ObjectId;
  unassignedAt: Date | null;
  unassignedBy: Types.ObjectId | null;
}

const chemistAssignmentSchema = new Schema<ChemistAssignmentDoc>({
  chemistId: { type: Schema.Types.ObjectId, required: true, ref: 'Chemist' },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  status: { type: String, required: true, enum: ['active', 'inactive'] },
  assignedAt: { type: Date, required: true },
  assignedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  unassignedAt: { type: Date, default: null },
  unassignedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
});

// Many MRs per Chemist, but one active row per (Chemist, MR), enforced by the database so a racing double-assign can't duplicate.
chemistAssignmentSchema.index({ chemistId: 1, userId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
// "This MR's Chemists" (the phone's list, a manager's team read) and the history list.
chemistAssignmentSchema.index({ userId: 1, status: 1 });
chemistAssignmentSchema.index({ chemistId: 1, assignedAt: -1 });

export const ChemistAssignmentModel = model<ChemistAssignmentDoc>('ChemistAssignment', chemistAssignmentSchema);
