import { Schema, model, type Types } from 'mongoose';
import { LEAVE_GRANT_STATUSES, type LeaveGrantStatus } from '../domain/leaveApprovalGrant.entity.js';

export interface LeaveApprovalGrantDoc {
  leaveId: Types.ObjectId;
  userId: Types.ObjectId;
  reason: string;
  grantedBy: Types.ObjectId;
  grantedAt: Date;
  expiresAt: Date;
  status: LeaveGrantStatus;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: Types.ObjectId | null;
}

const leaveApprovalGrantSchema = new Schema<LeaveApprovalGrantDoc>({
  leaveId: { type: Schema.Types.ObjectId, required: true, ref: 'Leave' },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  reason: { type: String, required: true },
  grantedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  grantedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, required: true, enum: LEAVE_GRANT_STATUSES },
  usedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
});

// At most one OPEN grant per leave; any number of closed ones.
leaveApprovalGrantSchema.index({ leaveId: 1 }, { unique: true, partialFilterExpression: { status: 'OPEN' } });

export const LeaveApprovalGrantModel = model<LeaveApprovalGrantDoc>('LeaveApprovalGrant', leaveApprovalGrantSchema);
