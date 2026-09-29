import { Schema, model, type Types } from 'mongoose';
import { MASTER_STATUSES, type MasterStatus } from '../domain/masterStatus.js';

export interface ChemistDoc {
  routeId: Types.ObjectId;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  status: MasterStatus;
}

const chemistSchema = new Schema<ChemistDoc>({
  routeId: { type: Schema.Types.ObjectId, required: true, ref: 'Route' },
  name: { type: String, required: true },
  address: { type: String, required: true },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  status: { type: String, required: true, enum: MASTER_STATUSES },
});
chemistSchema.index({ routeId: 1, status: 1 });

export const ChemistModel = model<ChemistDoc>('Chemist', chemistSchema);
