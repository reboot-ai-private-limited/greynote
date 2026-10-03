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
  baseSalaryPaise: number;
  taPerKmRatePaise: number;
  /** DA for a day worked in an HQ / Ex-station / Out-station Area. */
  hqDaPaise: number;
  exStationDaPaise: number;
  outStationDaPaise: number;
}
export type CreatePayBandDto = Omit<PayBandDto, 'id'>;
export type UpdatePayBandDto = Partial<CreatePayBandDto>;
