import { Schema, model, type Types } from 'mongoose';
import { ALL_DOCTOR_SERVICE_TYPES, type DoctorServiceType } from '../domain/serviceGift.entity.js';

export interface DoctorServiceDoc {
  doctorId: Types.ObjectId;
  userId: Types.ObjectId;
  createdBy: Types.ObjectId;
  origin: 'MR' | 'ADMIN';
  serviceType: DoctorServiceType;
  amountPaise: number;
  remarks: string | null;
  clientId: string | null;
  createdAt: Date;
  doneBy?: Types.ObjectId | null;
  doneAt?: Date | null;
}
const serviceSchema = new Schema<DoctorServiceDoc>({
  doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'Doctor' },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  origin: { type: String, required: true, enum: ['MR', 'ADMIN'] },
  serviceType: { type: String, required: true, enum: [...ALL_DOCTOR_SERVICE_TYPES] },
  amountPaise: { type: Number, required: true, min: 1 },
  remarks: { type: String, default: null },
  clientId: { type: String, default: null },
  createdAt: { type: Date, required: true },
  doneBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  doneAt: { type: Date, default: null },
});
serviceSchema.index({ userId: 1, createdAt: -1 });
serviceSchema.index({ doctorId: 1, createdAt: -1 });
// One Service per phone record; Admin-made ones have no client id and are left out.
serviceSchema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
export const DoctorServiceModel = model<DoctorServiceDoc>('DoctorService', serviceSchema);

export interface DoctorGiftDoc {
  doctorId: Types.ObjectId;
  allocatedBy: Types.ObjectId;
  productName: string;
  amountPaise: number;
  status: 'REQUESTED' | 'PENDING' | 'DONE' | 'REJECTED';
  origin?: 'ADMIN' | 'EMPLOYEE';
  requestedBy?: Types.ObjectId | null;
  requestNote?: string | null;
  rejectReason?: string | null;
  completedBy: Types.ObjectId | null;
  completedAt: Date | null;
  allocatedAt: Date;
}
const giftSchema = new Schema<DoctorGiftDoc>({
  doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'Doctor' },
  allocatedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  productName: { type: String, required: true },
  amountPaise: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: ['REQUESTED', 'PENDING', 'DONE', 'REJECTED'], default: 'PENDING' },
  origin: { type: String, enum: ['ADMIN', 'EMPLOYEE'], default: 'ADMIN' },
  requestedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  requestNote: { type: String, default: null },
  rejectReason: { type: String, default: null },
  completedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  completedAt: { type: Date, default: null },
  allocatedAt: { type: Date, required: true },
});
giftSchema.index({ doctorId: 1, status: 1, allocatedAt: -1 });
export const DoctorGiftModel = model<DoctorGiftDoc>('DoctorGift', giftSchema);
