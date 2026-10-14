/**
 * Why a FIELD login was refused because of the phone, not the password. The values are the
 * backend's own `publicDetails.reason` codes on a 409/403 from POST /api/identity/auth/login
 * (apps/api/src/modules/identity/application/usecases/login.usecase.ts), so the app can pass
 * the server's value straight through.
 */
export type DeviceBlockReason =
  | 'DEVICE_APPROVAL_PENDING'
  | 'DEVICE_REJECTED'
  | 'DEVICE_LIMIT_REACHED';

/** `user` in the login response — apps/api identity `UserSummary`. */
export type SessionUser = {
  id: string;
  employeeCode: string;
  name: string;
  role: 'ADMIN' | 'HR' | 'ACCOUNTANT' | 'FIELD';
  designationId: string | null;
  managerId: string | null;
  status: string;
  /** The profile picture's address; null or missing when there is none (older servers do not send it). */
  photoUrl?: string | null;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SessionUser;
};
