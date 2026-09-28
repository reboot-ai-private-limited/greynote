import { Schema, model, type Types } from 'mongoose';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface UserHqAssignmentDoc {
  userId: Types.ObjectId;
  hqId: Types.ObjectId;
  status: TerritoryStatus;
  assignedAt: Date;
  assignedBy: Types.ObjectId;
  unassignedAt: Date | null;
  unassignedBy: Types.ObjectId | null;
}

const userHqAssignmentSchema = new Schema<UserHqAssignmentDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  hqId: { type: Schema.Types.ObjectId, required: true, ref: 'Hq' },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
  assignedAt: { type: Date, required: true },
  assignedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  unassignedAt: { type: Date, default: null },
  unassignedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
});

// One active HQ per user; any number of ended rows. Also serves the history list.
userHqAssignmentSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
userHqAssignmentSchema.index({ userId: 1, assignedAt: -1 });

export const UserHqAssignmentModel = model<UserHqAssignmentDoc>('UserHqAssignment', userHqAssignmentSchema);
