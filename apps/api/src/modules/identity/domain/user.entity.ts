import type { RoleName } from '@greynote/contracts';

/** `pending` = onboarding incomplete (FIELD role only), `inactive` = deactivated/offboarded. */
export type UserStatus = 'active' | 'pending' | 'inactive';

export interface Address {
  district: string;
  state: string;
  pincode: string;
  /** Defaults to 'India' at the DTO layer — domain just stores whatever it's given. */
  country: string;
}

export interface BankDetails {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string | null;
}

export interface UserDocument {
  /**
   * Internal uuid v7, separate from Cloudinary's `publicId` — routing a DELETE by `publicId`
   * would break on Cloudinary public IDs that contain slashes (folder-style paths); routing by
   * our own opaque id doesn't.
   */
  id: string;
  type: string;
  url: string;
  publicId: string;
  uploadedAt: Date;
}

export interface User {
  id: string;
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobileNumber: string | null;
  guardianName: string | null;
  dateOfBirth: Date | null;
  address: Address | null;
  qualification: string | null;
  bankDetails: BankDetails | null;
  documents: UserDocument[];
  status: UserStatus;
  roleId: string;
  /** FIELD-role only — must be null for ADMIN/HR/ACCOUNTANT, enforced at write time. */
  designationId: string | null;
  /** FIELD-role only — must be null for ADMIN/HR/ACCOUNTANT, enforced at write time. */
  payBandId: string | null;
  managerId: string | null;
  passwordHash: string;
  dateOfJoining: Date;
  lastLoginAt: Date | null;
  isBlocked: boolean;
  blockedReason: string | null;
  blockedAt: Date | null;
  /** Must resolve to an ADMIN-role user — never the target's manager. */
  unblockedBy: string | null;
  unblockedAt: Date | null;
}

/** What most other modules/consumers need for display or authorization — never `passwordHash`. */
export interface UserSummary {
  id: string;
  employeeCode: string;
  name: string;
  role: RoleName;
  designationId: string | null;
  managerId: string | null;
  status: UserStatus;
}

export function toUserSummary(user: User, role: RoleName): UserSummary {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    role,
    designationId: user.designationId,
    managerId: user.managerId,
    status: user.status,
  };
}
