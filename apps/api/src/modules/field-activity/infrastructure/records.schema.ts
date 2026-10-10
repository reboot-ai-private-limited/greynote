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
// Visits per Doctor in a month (the visit-frequency report).
doctorCallSchema.index({ doctorId: 1, reportDate: 1 });
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

export interface ExpenseDoc {
  dcrId: Types.ObjectId | null;
  userId: Types.ObjectId;
  reportDate: string;
  routeId: Types.ObjectId | null;
  type: 'TA' | 'DA' | 'OTHER' | 'TRAVEL' | 'MEAL' | 'MISC';
  source: 'AUTO' | 'MANUAL';
  amountPaise: number;
  remarks: string | null;
  paymentStatus: 'UNPAID' | 'PAID' | 'CANCELLED';
  accepted: boolean;
  monthApproved: boolean;
  distanceFlag: boolean;
  paidBy: Types.ObjectId | null;
  paidAt: Date | null;
  clientId: string | null;
  recordedAt: Date;
  attachments?: Array<{ _id: Types.ObjectId; url: string; publicId: string; fileName: string; mimeType: string; sizeBytes: number; uploadedAt: Date }>;
}
const expenseAttachmentSchema = new Schema(
  { url: { type: String, required: true }, publicId: { type: String, required: true }, fileName: { type: String, required: true }, mimeType: { type: String, required: true }, sizeBytes: { type: Number, required: true }, uploadedAt: { type: Date, required: true } },
);
const expenseSchema = new Schema<ExpenseDoc>({
  dcrId: { type: Schema.Types.ObjectId, default: null, ref: 'Dcr' },
  userId: ref('User'),
  reportDate: { type: String, required: true },
  routeId: { type: Schema.Types.ObjectId, default: null, ref: 'Route' },
  type: { type: String, required: true, enum: ['TA', 'DA', 'OTHER', 'TRAVEL', 'MEAL', 'MISC'] },
  source: { type: String, required: true, enum: ['AUTO', 'MANUAL'] },
  amountPaise: { type: Number, required: true, min: 0 },
  remarks: { type: String, default: null },
  paymentStatus: { type: String, required: true, enum: ['UNPAID', 'PAID', 'CANCELLED'], default: 'UNPAID' },
  accepted: { type: Boolean, default: false },
  monthApproved: { type: Boolean, default: false },
  distanceFlag: { type: Boolean, default: false },
  paidBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  paidAt: { type: Date, default: null },
  clientId: { type: String, default: null },
  recordedAt: { type: Date, required: true },
  attachments: { type: [expenseAttachmentSchema], default: [] },
});
expenseSchema.index({ dcrId: 1, recordedAt: 1 });
// The Accountant's audit list and Payroll's monthly total.
expenseSchema.index({ accepted: 1, paymentStatus: 1, reportDate: 1 });
expenseSchema.index({ userId: 1, reportDate: 1, paymentStatus: 1 });
// One MANUAL expense per phone record; AUTO rows have no client id and are left out of the index.
expenseSchema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

export const ExpenseModel = model<ExpenseDoc>('Expense', expenseSchema);

export interface ExpenseMonthDoc {
  userId: Types.ObjectId;
  month: string;
  status: 'DRAFT' | 'SUBMITTED';
  submittedAt: Date | null;
  /** Totals at submit, so the approver sees what was sent even if a DCR changes later. */
  taPaise: number;
  daPaise: number;
  otherPaise: number;
}
const expenseMonthSchema = new Schema<ExpenseMonthDoc>(
  {
    userId: ref('User'),
    month: { type: String, required: true },
    status: { type: String, required: true, enum: ['DRAFT', 'SUBMITTED'], default: 'DRAFT' },
    submittedAt: { type: Date, default: null },
    taPaise: { type: Number, default: 0, min: 0 },
    daPaise: { type: Number, default: 0, min: 0 },
    otherPaise: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
expenseMonthSchema.index({ userId: 1, month: 1 }, { unique: true });
export const ExpenseMonthModel = model<ExpenseMonthDoc>('ExpenseMonth', expenseMonthSchema);
export const DoctorCallModel = model<DoctorCallDoc>('DoctorCall', doctorCallSchema);
export const ChemistCallModel = model<ChemistCallDoc>('ChemistCall', chemistCallSchema);
export const FollowupModel = model<FollowupDoc>('Followup', followupSchema);
