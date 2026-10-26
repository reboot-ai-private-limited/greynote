import { Schema, model, type Types } from 'mongoose';
import { DISTRIBUTOR_DOCUMENT_TYPES, type DistributorDocumentType } from '../domain/distributor.entity.js';
import { MASTER_STATUSES, type MasterStatus } from '../domain/masterStatus.js';

export interface DistributorDocumentRow {
  id: string;
  type: DistributorDocumentType;
  url: string;
  publicId: string;
  uploadedAt: Date;
}

export interface DistributorDoc {
  zoneIds?: Types.ObjectId[];
  hqIds?: Types.ObjectId[];
  routeIds: Types.ObjectId[];
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  assignedUserIds: Types.ObjectId[];
  documents?: DistributorDocumentRow[];
  openingDuesPaise?: number;
  status: MasterStatus;
}

const documentSchema = new Schema<DistributorDocumentRow>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: DISTRIBUTOR_DOCUMENT_TYPES },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const distributorSchema = new Schema<DistributorDoc>({
  zoneIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Zone' }], default: [] },
  hqIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Hq' }], default: [] },
  routeIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Route' }], default: [] },
  name: { type: String, required: true },
  gstNumber: { type: String, required: true },
  contactPerson: { type: String, required: true },
  mobile: { type: String, required: true },
  address: { type: String, required: true },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  assignedUserIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  documents: { type: [documentSchema], default: [] },
  openingDuesPaise: { type: Number, default: 0, min: 0 },
  status: { type: String, required: true, enum: MASTER_STATUSES },
});
distributorSchema.index({ routeIds: 1, status: 1 });
distributorSchema.index({ hqIds: 1, status: 1 });
distributorSchema.index({ zoneIds: 1, status: 1 });
distributorSchema.index({ assignedUserIds: 1 });

export const DistributorModel = model<DistributorDoc>('Distributor', distributorSchema);
