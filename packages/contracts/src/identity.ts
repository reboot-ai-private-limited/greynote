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
