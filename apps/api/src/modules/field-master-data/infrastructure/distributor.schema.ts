import { Schema, model, type Types } from 'mongoose';
import { MASTER_STATUSES, type MasterStatus } from '../domain/masterStatus.js';

export interface DistributorDoc {
  routeIds: Types.ObjectId[];
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  assignedUserIds: Types.ObjectId[];
  openingDuesPaise?: number;
  status: MasterStatus;
}

const distributorSchema = new Schema<DistributorDoc>({
  routeIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Route' }], required: true },
  name: { type: String, required: true },
  gstNumber: { type: String, required: true },
  contactPerson: { type: String, required: true },
  mobile: { type: String, required: true },
  address: { type: String, required: true },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  assignedUserIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  openingDuesPaise: { type: Number, default: 0, min: 0 },
  status: { type: String, required: true, enum: MASTER_STATUSES },
});
distributorSchema.index({ routeIds: 1, status: 1 });
distributorSchema.index({ assignedUserIds: 1 });

export const DistributorModel = model<DistributorDoc>('Distributor', distributorSchema);
