import { Schema, model, type Types } from 'mongoose';
import { LEAVE_HALVES, type LeaveDay, type LeaveHalf } from '../domain/leave.entity.js';

export interface LeaveDoc {
  userId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  isPaid: boolean;
  year: number;
  startDate: string;
  endDate: string;
  half: LeaveHalf | null;
  reason: string;
  days: LeaveDay[];
  daysCount: number;
  ledgerDays?: number;
  attachments?: Array<{ _id: Types.ObjectId; url: string; publicId: string; fileName: string; mimeType: string; sizeBytes: number; uploadedAt: Date }>;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const daySchema = new Schema<LeaveDay>({ date: { type: String, required: true }, portion: { type: Number, required: true } }, { _id: false });

const attachmentSchema = new Schema(
  { url: { type: String, required: true }, publicId: { type: String, required: true }, fileName: { type: String, required: true }, mimeType: { type: String, required: true }, sizeBytes: { type: Number, required: true }, uploadedAt: { type: Date, required: true } },
);

const leaveSchema = new Schema<LeaveDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  leaveTypeId: { type: Schema.Types.ObjectId, required: true, ref: 'LeaveType' },
  isPaid: { type: Boolean, required: true },
  year: { type: Number, required: true },
  // Calendar days as `YYYY-MM-DD` — they sort as strings.
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  half: { type: String, default: null, enum: [...LEAVE_HALVES, null] },
  reason: { type: String, required: true },
  days: { type: [daySchema], default: [] },
  daysCount: { type: Number, required: true },
  ledgerDays: { type: Number, min: 0 },
  attachments: { type: [attachmentSchema], default: [] },
  revision: { type: Number, required: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
});

// "This person's leaves around these dates" — overlap checks and the contract's day lookups.
leaveSchema.index({ userId: 1, startDate: 1 });
leaveSchema.index({ leaveTypeId: 1 });
leaveSchema.index({ createdAt: -1 });

export const LeaveModel = model<LeaveDoc>('Leave', leaveSchema);
