import { Schema, model, type Types } from 'mongoose';
import { DOCTOR_STATUSES, type DoctorStatus } from '../domain/doctor.entity.js';

export interface DoctorDoc {
  routeId: Types.ObjectId;
  /** Legacy: doctors saved before the category was dropped (2026-10-06) still carry it; nothing reads it. */
  category?: string;
  name: string;
  address: string;
  email: string | null;
  clinicName?: string | null;
  phone?: string | null;
  photo?: { url: string; publicId: string } | null;
  specialty: string;
  qualification: string;
  dateOfBirth: string | null;
  anniversary: string | null;
  visitFrequency: number | null;
  latitude: number | null;
  longitude: number | null;
  capturedLatitude: number | null;
  capturedLongitude: number | null;
  status: DoctorStatus;
  addedBy: Types.ObjectId;
  clientRequestId: string | null;
  approvedAt: Date | null;
}

const doctorSchema = new Schema<DoctorDoc>({
  routeId: { type: Schema.Types.ObjectId, required: true, ref: 'Route' },
  category: { type: String },
  name: { type: String, required: true },
  address: { type: String, required: true },
  email: { type: String, default: null },
  clinicName: { type: String, default: null },
  phone: { type: String, default: null },
  photo: { type: new Schema({ url: { type: String, required: true }, publicId: { type: String, required: true } }, { _id: false }), default: null },
  specialty: { type: String, required: true },
  qualification: { type: String, required: true },
  dateOfBirth: { type: String, default: null },
  anniversary: { type: String, default: null },
  visitFrequency: { type: Number, default: null },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  capturedLatitude: { type: Number, default: null },
  capturedLongitude: { type: Number, default: null },
  status: { type: String, required: true, enum: DOCTOR_STATUSES },
  addedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  clientRequestId: { type: String, default: null },
  approvedAt: { type: Date, default: null },
});
doctorSchema.index({ routeId: 1, status: 1 });
// An offline retry of the same create returns the first Doctor instead of adding a second.
doctorSchema.index({ addedBy: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } });
// "Doctors I added".
doctorSchema.index({ addedBy: 1, _id: -1 });

export const DoctorModel = model<DoctorDoc>('Doctor', doctorSchema);
