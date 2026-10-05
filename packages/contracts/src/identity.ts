/** One row of `GET /identity/devices/pending` — a bare array, oldest request first. */
export interface PendingDeviceDto {
  id: string;
  userId: string;
  deviceName: string;
  deviceModel: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  status: string;
  requestedAt: string;
  employeeCode: string | null;
  employeeName: string | null;
}

export type UserListStatus = 'active' | 'pending' | 'inactive';

/** One row of `GET /identity/users`. */
export interface UserListItemDto {
  id: string;
  employeeCode: string;
  name: string;
  role: 'ADMIN' | 'HR' | 'ACCOUNTANT' | 'FIELD';
  designationId: string | null;
  managerId: string | null;
  status: UserListStatus;
}

export const DESIGNATION_NAMES = ['MR', 'ASM', 'RSM', 'ZSM', 'NSM'] as const;
export type DesignationName = (typeof DESIGNATION_NAMES)[number];

/** One row of `GET /identity/designations` — a bare array, not paginated. `level` is the rank in the reporting chain. */
export interface DesignationDto {
  id: string;
  name: DesignationName;
  level: number;
}
export type CreateDesignationDto = Omit<DesignationDto, 'id'>;
export type UpdateDesignationDto = Partial<CreateDesignationDto>;

export const PAY_BAND_NAMES = ['G1', 'G2', 'G3'] as const;
export type PayBandName = (typeof PAY_BAND_NAMES)[number];

/** One row of `GET /identity/pay-bands` — a bare array. Money is whole paise (₹1 = 100). */
export interface PayBandDto {
  id: string;
  name: PayBandName;
  /** Pre-fills the CTC box when HR picks this grade for an employee — a suggestion, never enforced. */
  suggestedCtcAnnualPaise: number | null;
  taPerKmRatePaise: number;
  /** DA for a day worked in an HQ / Ex-station / Out-station Area. */
  hqDaPaise: number;
  exStationDaPaise: number;
  outStationDaPaise: number;
}
export type CreatePayBandDto = Omit<PayBandDto, 'id' | 'suggestedCtcAnnualPaise'> & { suggestedCtcAnnualPaise?: number | null };
export type UpdatePayBandDto = Partial<CreatePayBandDto>;

/** Body of `POST /identity/users`. Admin may create any role; HR only FIELD. Everything else is set later by the onboarding PATCH. */
export interface CreateUserDto {
  role: UserListItemDto['role'];
  employeeCode: string;
  name: string;
  password: string;
  email?: string;
  phone?: string;
}

export interface UserAddressDto {
  district: string;
  state: string;
  pincode: string;
  country: string;
}

export interface UserBankDetailsDto {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string | null;
}

export interface UserDocumentDto {
  id: string;
  type: string;
  url: string;
  publicId: string;
  uploadedAt: string;
}

/**
 * `GET /identity/users/:id` — the only place personal and bank details are returned.
 * `profile` is null for a non-FIELD user, or a FIELD user whose onboarding has not started.
 */
export interface UserDetailDto {
  id: string;
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserListItemDto['role'];
  status: UserListStatus;
  isBlocked: boolean;
  lastLoginAt: string | null;
  currentBlock: { reason: string; blockedAt: string } | null;
  profile: {
    designationId: string | null;
    payBandId: string | null;
    managerId: string | null;
    dateOfJoining: string | null;
    mobileNumber: string | null;
    guardianName: string | null;
    dateOfBirth: string | null;
    address: UserAddressDto | null;
    qualification: string | null;
    bankDetails: UserBankDetailsDto | null;
    documents: UserDocumentDto[];
  } | null;
}

/** Body of `PATCH /identity/users/:id` — every section optional; an address or bank object is sent whole. */
export interface UpdateUserDto {
  basicDetails?: {
    name?: string;
    mobileNumber?: string;
    /** `null` clears the three optional fields (guardian, joining date, qualification); a missing key leaves them alone. */
    guardianName?: string | null;
    dateOfBirth?: string;
    dateOfJoining?: string | null;
    qualification?: string | null;
    address?: UserAddressDto;
  };
  bankDetails?: Omit<UserBankDetailsDto, 'branchName'> & { branchName?: string };
  designationId?: string;
  payBandId?: string;
  managerId?: string;
  status?: 'inactive';
}

export const DEVICE_STATUSES = ['PENDING', 'REGISTERED', 'REJECTED', 'REMOVED'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** One row of `GET /identity/users/:id/devices` — every status, newest first. */
export interface UserDeviceDto {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  status: DeviceStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** A rejected phone is blocked until this passes, then it counts as new. */
  expiresAt: string | null;
  /** A live session exists on this phone. Only a registered phone can be logged in. */
  loggedIn: boolean;
  lastActiveAt: string | null;
}
