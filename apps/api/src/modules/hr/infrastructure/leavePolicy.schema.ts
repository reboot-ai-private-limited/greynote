import { Schema, model, type Types } from 'mongoose';

export interface LeavePolicyDoc {
  payBandId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  defaultDays: number;
  updatedBy: Types.ObjectId;
  updatedAt: Date;
}

const leavePolicySchema = new Schema<LeavePolicyDoc>({
  payBandId: { type: Schema.Types.ObjectId, required: true, ref: 'PayBand' },
  leaveTypeId: { type: Schema.Types.ObjectId, required: true, ref: 'LeaveType' },
  defaultDays: { type: Number, required: true },
  updatedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  updatedAt: { type: Date, required: true },
});

// One row per grade and type; also serves "this grade's defaults" when seeding balances.
leavePolicySchema.index({ payBandId: 1, leaveTypeId: 1 }, { unique: true });
leavePolicySchema.index({ leaveTypeId: 1 });

export const LeavePolicyModel = model<LeavePolicyDoc>('LeavePolicy', leavePolicySchema);
