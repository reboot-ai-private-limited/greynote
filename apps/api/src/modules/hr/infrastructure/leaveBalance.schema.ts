import { Schema, model, type Types } from 'mongoose';

export interface LeaveBalanceDoc {
  userId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  year: number;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
  adjustedBy: Types.ObjectId | null;
  adjustedAt: Date | null;
  adjustReason: string | null;
}

const leaveBalanceSchema = new Schema<LeaveBalanceDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  leaveTypeId: { type: Schema.Types.ObjectId, required: true, ref: 'LeaveType' },
  year: { type: Number, required: true },
  allocatedDays: { type: Number, required: true },
  usedDays: { type: Number, required: true, default: 0 },
  pendingDays: { type: Number, required: true, default: 0 },
  adjustedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  adjustedAt: { type: Date, default: null },
  adjustReason: { type: String, default: null },
});

// One row per employee, type and leave year — what makes lazy seeding safe to race.
leaveBalanceSchema.index({ userId: 1, year: 1, leaveTypeId: 1 }, { unique: true });
leaveBalanceSchema.index({ leaveTypeId: 1 });

export const LeaveBalanceModel = model<LeaveBalanceDoc>('LeaveBalance', leaveBalanceSchema);
