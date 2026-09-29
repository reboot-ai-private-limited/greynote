import { Schema, model, type Types } from 'mongoose';

const GEOFENCE_STATUSES = ['PASS', 'FAIL', 'UNVERIFIED', 'OVERRIDE'] as const;
const WORKING_TYPES = ['FIELD_WORK', 'MEETING', 'CONFERENCE', 'STRIKE'] as const;

interface CallDocBase {
  dcrId: Types.ObjectId;
  userId: Types.ObjectId;
  reportDate: string;
  workingType: (typeof WORKING_TYPES)[number];
  workWith: Types.ObjectId[];
  remarks: string | null;
  capturedLatitude: number | null;
  capturedLongitude: number | null;
  accuracyMeters: number | null;
  geofenceStatus: (typeof GEOFENCE_STATUSES)[number];
  geofenceDistanceMeters: number | null;
  geofenceReason: string | null;
  geofenceOverriddenBy: Types.ObjectId | null;
  geofenceOverriddenAt: Date | null;
  geofenceOverrideComment: string | null;
  clientId: string;
  recordedAt: Date;
}

export interface DoctorCallDoc extends CallDocBase {
  doctorId: Types.ObjectId;
  samples: Array<{ allocationId: Types.ObjectId; productId: Types.ObjectId; quantity: number }>;
}
export interface ChemistCallDoc extends CallDocBase {
  chemistId: Types.ObjectId;
}
export interface FollowupDoc {
  dcrId: Types.ObjectId;
  userId: Types.ObjectId;
  reportDate: string;
  subject: 'DOCTOR' | 'CHEMIST';
  subjectId: Types.ObjectId;
  remarks: string;
  clientId: string;
  recordedAt: Date;
}

const ref = (to: string, required = true) => ({ type: Schema.Types.ObjectId, required, ref: to });
const callFields = {
  dcrId: ref('Dcr'),
  userId: ref('User'),
  reportDate: { type: String, required: true },
  workingType: { type: String, required: true, enum: WORKING_TYPES },
  workWith: { type: [Schema.Types.ObjectId], default: [], ref: 'User' },
  remarks: { type: String, default: null },
  capturedLatitude: { type: Number, default: null },
  capturedLongitude: { type: Number, default: null },
  accuracyMeters: { type: Number, default: null },
  geofenceStatus: { type: String, required: true, enum: GEOFENCE_STATUSES },
  geofenceDistanceMeters: { type: Number, default: null },
  geofenceReason: { type: String, default: null },
  geofenceOverriddenBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  geofenceOverriddenAt: { type: Date, default: null },
  geofenceOverrideComment: { type: String, default: null },
  clientId: { type: String, required: true },
  recordedAt: { type: Date, required: true },
};

const doctorCallSchema = new Schema<DoctorCallDoc>({
  ...callFields,
  doctorId: ref('Doctor'),
  samples: {
    type: [new Schema({ allocationId: ref('SampleAllocation'), productId: ref('Product'), quantity: { type: Number, required: true, min: 1 } }, { _id: false })],
    default: [],
  },
});
doctorCallSchema.index({ dcrId: 1, recordedAt: 1 });
// One call per phone record: a second guard behind the sync receipt.
doctorCallSchema.index({ userId: 1, clientId: 1 }, { unique: true });

const chemistCallSchema = new Schema<ChemistCallDoc>({ ...callFields, chemistId: ref('Chemist') });
chemistCallSchema.index({ dcrId: 1, recordedAt: 1 });
chemistCallSchema.index({ userId: 1, clientId: 1 }, { unique: true });

const followupSchema = new Schema<FollowupDoc>({
  dcrId: ref('Dcr'),
  userId: ref('User'),
  reportDate: { type: String, required: true },
  subject: { type: String, required: true, enum: ['DOCTOR', 'CHEMIST'] },
  subjectId: { type: Schema.Types.ObjectId, required: true },
  remarks: { type: String, required: true },
  clientId: { type: String, required: true },
  recordedAt: { type: Date, required: true },
});
followupSchema.index({ dcrId: 1, recordedAt: 1 });
followupSchema.index({ userId: 1, clientId: 1 }, { unique: true });

export const DoctorCallModel = model<DoctorCallDoc>('DoctorCall', doctorCallSchema);
export const ChemistCallModel = model<ChemistCallDoc>('ChemistCall', chemistCallSchema);
export const FollowupModel = model<FollowupDoc>('Followup', followupSchema);
