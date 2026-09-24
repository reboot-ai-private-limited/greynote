import { Schema, model, type Types } from 'mongoose';
import { TERRITORY_STATUSES, type TerritoryStatus } from '../domain/territoryStatus.js';

export interface RouteAssignmentDoc {
  routeId: Types.ObjectId;
  userId: Types.ObjectId;
  status: TerritoryStatus;
  assignedAt: Date;
  assignedBy: Types.ObjectId;
  unassignedAt: Date | null;
  unassignedBy: Types.ObjectId | null;
}

const routeAssignmentSchema = new Schema<RouteAssignmentDoc>({
  routeId: { type: Schema.Types.ObjectId, required: true, ref: 'Route' },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  status: { type: String, required: true, enum: TERRITORY_STATUSES },
  assignedAt: { type: Date, required: true },
  assignedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  unassignedAt: { type: Date, default: null },
  unassignedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
});

// One ACTIVE row per (route, user); any number of inactive history rows. Also serves a Route's
// assignment list.
routeAssignmentSchema.index(
  { routeId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
// "Which routes does this MR cover" — every Planning route picker.
routeAssignmentSchema.index({ userId: 1, status: 1 });

export const RouteAssignmentModel = model<RouteAssignmentDoc>('RouteAssignment', routeAssignmentSchema);
