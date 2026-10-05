import { Schema, model, type Types } from 'mongoose';

interface AddressDoc {
  district: string;
  state: string;
  pincode: string;
  country: string;
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
  probationMonths?: number | null;
  mobileNumber: string | null;
  guardianName: string | null;
  dateOfBirth: Date | null;
  address: AddressDoc | null;
  qualification: string | null;
  bankDetails: BankDetailsDoc | null;
  documents: UserDocumentDoc[];
}

const addressSchema = new Schema<AddressDoc>(
  {
    district: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, required: true, default: 'India' },
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
  probationMonths: { type: Number, default: null, min: 0, max: 36 },
  mobileNumber: { type: String, default: null },
  guardianName: { type: String, default: null },
  dateOfBirth: { type: Date, default: null },
  address: { type: addressSchema, default: null },
  qualification: { type: String, default: null },
  bankDetails: { type: bankDetailsSchema, default: null },
  documents: { type: [userDocumentSchema], default: [] },
});

// "Who reports to X" (listUsers' manager filter, getDirectReports) and every hop of the
// getDownline traversal look profiles up by managerId.
employeeProfileSchema.index({ managerId: 1 });

export const EmployeeProfileModel = model<EmployeeProfileDoc>('EmployeeProfile', employeeProfileSchema);
