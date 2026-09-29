import { Schema, model, type Types } from 'mongoose';
import { MASTER_STATUSES, type MasterStatus } from '../domain/masterStatus.js';

export interface DistributorDoc {
  routeId: Types.ObjectId;
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  assignedMrId: Types.ObjectId | null;
  assignedAsmId: Types.ObjectId | null;
  primarySalesEnabled: boolean;
  secondarySalesEnabled: boolean;
  status: MasterStatus;
}

const distributorSchema = new Schema<DistributorDoc>({
  routeId: { type: Schema.Types.ObjectId, required: true, ref: 'Route' },
  name: { type: String, required: true },
  gstNumber: { type: String, required: true },
  contactPerson: { type: String, required: true },
  mobile: { type: String, required: true },
  address: { type: String, required: true },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  assignedMrId: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  assignedAsmId: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  primarySalesEnabled: { type: Boolean, required: true },
  secondarySalesEnabled: { type: Boolean, required: true },
  status: { type: String, required: true, enum: MASTER_STATUSES },
});
distributorSchema.index({ routeId: 1, status: 1 });
distributorSchema.index({ assignedMrId: 1 });

export const DistributorModel = model<DistributorDoc>('Distributor', distributorSchema);
