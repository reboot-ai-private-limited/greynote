import { Schema, model, type Types } from 'mongoose';
import { CHEMIST_STATUSES, type ChemistStatus } from '../domain/chemist.entity.js';

export interface ChemistDoc {
  routeId: Types.ObjectId;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  capturedLatitude?: number | null;
  capturedLongitude?: number | null;
  status: ChemistStatus;
  addedBy?: Types.ObjectId | null;
  clientRequestId?: string | null;
  approvedAt?: Date | null;
}

const chemistSchema = new Schema<ChemistDoc>({
  routeId: { type: Schema.Types.ObjectId, required: true, ref: 'Route' },
  name: { type: String, required: true },
  address: { type: String, required: true },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  capturedLatitude: { type: Number, default: null },
  capturedLongitude: { type: Number, default: null },
  status: { type: String, required: true, enum: CHEMIST_STATUSES },
  addedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  clientRequestId: { type: String, default: null },
  approvedAt: { type: Date, default: null },
});
chemistSchema.index({ routeId: 1, status: 1 });
// An offline retry of the same create returns the first Chemist instead of adding a second.
chemistSchema.index({ addedBy: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } });
// "Chemists I added".
chemistSchema.index({ addedBy: 1, _id: -1 });

export const ChemistModel = model<ChemistDoc>('Chemist', chemistSchema);
