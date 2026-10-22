import { Schema, model, type Types } from 'mongoose';

interface AddressDoc {
  line1?: string | null;
  line2?: string | null;
  district: string;
  state: string;
  pincode: string;
  country: string;
}

interface QualificationDoc {
  degree: string;
  institute: string;
  yearOfPassing: number;
}

interface PreviousEmploymentDoc {
  companyName: string;
  joiningDate: Date;
  endDate: Date | null;
}

interface BankDetailsDoc {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string | null;
}

interface UserDocumentDoc {
  id: string;
  type: string;
  url: string;
  publicId: string;
  uploadedAt: Date;
}

export interface EmployeeProfileDoc {
  userId: Types.ObjectId;
  designationId: Types.ObjectId | null;
  payBandId: Types.ObjectId | null;
  managerId: Types.ObjectId | null;
  dateOfJoining: Date | null;
  lastWorkingDay?: string | null;
  rejoinedOn?: string | null;
  onProbation?: boolean;
  probationMonths?: number | null;
  esiNumber?: string | null;
  epfNumber?: string | null;
  hqId?: Types.ObjectId | null;
  zoneId?: Types.ObjectId | null;
  mobileNumber: string | null;
  alternateMobile?: string | null;
  guardianName: string | null;
  dateOfBirth: Date | null;
  address: AddressDoc | null;
  permanentAddress?: AddressDoc | null;
  permanentSameAsPresent?: boolean;
  qualification: string | null;
  qualifications?: QualificationDoc[];
  previousEmployment?: PreviousEmploymentDoc[];
  bankDetails: BankDetailsDoc | null;
  documents: UserDocumentDoc[];
  photo?: { url: string; publicId: string } | null;
}

const addressSchema = new Schema<AddressDoc>(
  {
    line1: { type: String, default: null },
    line2: { type: String, default: null },
    district: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, required: true, default: 'India' },
  },
  { _id: false },
);

const qualificationSchema = new Schema<QualificationDoc>(
  {
    degree: { type: String, required: true },
    institute: { type: String, required: true },
    yearOfPassing: { type: Number, required: true },
  },
  { _id: false },
);

const previousEmploymentSchema = new Schema<PreviousEmploymentDoc>(
  {
    companyName: { type: String, required: true },
    joiningDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
  },
  { _id: false },
);

const bankDetailsSchema = new Schema<BankDetailsDoc>(
  {
    bankName: { type: String, required: true },
    ifsc: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountHolderName: { type: String, required: true },
    branchName: { type: String, default: null },
  },
  { _id: false },
);

const userDocumentSchema = new Schema<UserDocumentDoc>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const employeeProfileSchema = new Schema<EmployeeProfileDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true, ref: 'User' },
  designationId: { type: Schema.Types.ObjectId, default: null, ref: 'Designation' },
  payBandId: { type: Schema.Types.ObjectId, default: null, ref: 'PayBand' },
  managerId: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  dateOfJoining: { type: Date, default: null },
  // Calendar days (`YYYY-MM-DD`), set by deactivation and reactivation.
  lastWorkingDay: { type: String, default: null },
  rejoinedOn: { type: String, default: null },
  onProbation: { type: Boolean, default: false },
  probationMonths: { type: Number, default: null, min: 0, max: 36 },
  esiNumber: { type: String, default: null, match: /^\d{17}$/ },
  epfNumber: { type: String, default: null, match: /^[A-Z0-9/-]{1,30}$/ },
  hqId: { type: Schema.Types.ObjectId, default: null, ref: 'Hq' },
  zoneId: { type: Schema.Types.ObjectId, default: null, ref: 'Zone' },
  mobileNumber: { type: String, default: null },
  alternateMobile: { type: String, default: null },
  guardianName: { type: String, default: null },
  dateOfBirth: { type: Date, default: null },
  address: { type: addressSchema, default: null },
  permanentAddress: { type: addressSchema, default: null },
  permanentSameAsPresent: { type: Boolean, default: false },
  qualification: { type: String, default: null },
  qualifications: { type: [qualificationSchema], default: [] },
  previousEmployment: { type: [previousEmploymentSchema], default: [] },
  bankDetails: { type: bankDetailsSchema, default: null },
  documents: { type: [userDocumentSchema], default: [] },
  photo: { type: new Schema({ url: { type: String, required: true }, publicId: { type: String, required: true } }, { _id: false }), default: null },
});

// "Who reports to X" (listUsers' manager filter, getDirectReports) and every hop of the
// getDownline traversal look profiles up by managerId.
employeeProfileSchema.index({ managerId: 1 });

export const EmployeeProfileModel = model<EmployeeProfileDoc>('EmployeeProfile', employeeProfileSchema);
