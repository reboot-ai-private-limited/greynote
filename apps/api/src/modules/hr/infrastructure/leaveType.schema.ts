import { Schema, model } from 'mongoose';

export interface LeaveTypeDoc {
  name: string;
  /** Lower-cased, trimmed name — unique, so "casual" and "Casual" can't both exist. */
  nameKey: string;
  isPaid: boolean;
  active: boolean;
}

const leaveTypeSchema = new Schema<LeaveTypeDoc>({
  name: { type: String, required: true },
  nameKey: { type: String, required: true, unique: true },
  isPaid: { type: Boolean, required: true },
  active: { type: Boolean, required: true, default: true },
});

export const LeaveTypeModel = model<LeaveTypeDoc>('LeaveType', leaveTypeSchema);
