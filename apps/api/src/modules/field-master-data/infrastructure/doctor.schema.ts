import { Schema, model, type Types } from 'mongoose';
import { DOCTOR_STATUSES, type DoctorStatus } from '../domain/doctor.entity.js';

export interface DoctorDoc {
  routeId: Types.ObjectId;
  category: string;
  name: string;
  address: string;
  email: string | null;
  specialty: string;
  qualification: string;
  latitude: number | null;
  longitude: number | null;
  status: DoctorStatus;
  addedBy: Types.ObjectId;
  approvedAt: Date | null;
}

const doctorSchema = new Schema<DoctorDoc>({
  routeId: { type: Schema.Types.ObjectId, required: true, ref: 'Route' },
  category: { type: String, required: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  email: { type: String, default: null },
  specialty: { type: String, required: true },
  qualification: { type: String, required: true },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  status: { type: String, required: true, enum: DOCTOR_STATUSES },
  addedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  approvedAt: { type: Date, default: null },
});
doctorSchema.index({ routeId: 1, status: 1 });

export const DoctorModel = model<DoctorDoc>('Doctor', doctorSchema);
