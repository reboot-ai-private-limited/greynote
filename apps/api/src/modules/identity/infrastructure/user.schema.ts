import { Schema, model, type Types } from 'mongoose';
import type { UserStatus } from '../domain/user.entity.js';

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

export interface UserDoc {
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobileNumber: string | null;
  guardianName: string | null;
  dateOfBirth: Date | null;
  address: AddressDoc | null;
  qualification: string | null;
  bankDetails: BankDetailsDoc | null;
  documents: UserDocumentDoc[];
  status: UserStatus;
  roleId: Types.ObjectId;
  designationId: Types.ObjectId | null;
  payBandId: Types.ObjectId | null;
  managerId: Types.ObjectId | null;
  passwordHash: string;
  dateOfJoining: Date;
  lastLoginAt: Date | null;
  isBlocked: boolean;
  blockedReason: string | null;
  blockedAt: Date | null;
  unblockedBy: Types.ObjectId | null;
  unblockedAt: Date | null;
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

const userSchema = new Schema<UserDoc>({
  employeeCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, default: null, unique: true, sparse: true },
  phone: { type: String, default: null },
  mobileNumber: { type: String, default: null },
  guardianName: { type: String, default: null },
  dateOfBirth: { type: Date, default: null },
  address: { type: addressSchema, default: null },
  qualification: { type: String, default: null },
  bankDetails: { type: bankDetailsSchema, default: null },
  documents: { type: [userDocumentSchema], default: [] },
  status: { type: String, required: true, enum: ['active', 'pending', 'inactive'] },
  roleId: { type: Schema.Types.ObjectId, required: true, ref: 'Role' },
  designationId: { type: Schema.Types.ObjectId, default: null, ref: 'Designation' },
  payBandId: { type: Schema.Types.ObjectId, default: null, ref: 'PayBand' },
  managerId: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  passwordHash: { type: String, required: true },
  dateOfJoining: { type: Date, required: true },
  lastLoginAt: { type: Date, default: null },
  isBlocked: { type: Boolean, required: true, default: false },
  blockedReason: { type: String, default: null },
  blockedAt: { type: Date, default: null },
  unblockedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  unblockedAt: { type: Date, default: null },
});

export const UserModel = model<UserDoc>('User', userSchema);
