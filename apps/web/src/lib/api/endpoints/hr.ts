import type {
  AdjustLeaveBalanceDto,
  CreateHolidayDto,
  CreateLeaveTypeDto,
  HolidayDto,
  HolidayScope,
  LeaveBalanceDto,
  LeaveDetailDto,
  LeavePolicyDto,
  LeaveRequestDto,
  LeaveTypeDto,
  PaginatedDto,
  UpdateLeaveTypeDto,
} from '@greynote/contracts';
import { request } from '../client';

export interface ListHolidaysQuery {
  /** `YYYY-MM-DD`, both required, at most 400 days apart. */
  from: string;
  to: string;
  scope?: HolidayScope | undefined;
  zoneId?: string | undefined;
  hqId?: string | undefined;
}

export interface ListLeavesQuery {
  userId?: string | undefined;
  /** `YYYY-MM-DD`: leaves whose dates meet this range. */
  from?: string | undefined;
  to?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export const hrApi = {
  /** Leaves overlapping `from`–`to` (`YYYY-MM-DD`). There is no status filter. Used by the dashboard. */
  leaves: (token: string, query: { from: string; to: string; pageSize?: number }, signal?: AbortSignal) =>
    request<PaginatedDto<LeaveRequestDto>>('/hr/leaves', { token, query: { ...query }, signal }),

  /** HR and Admin: everyone's leaves, newest first, each with its approval. */
  allLeaves: (token: string, query: ListLeavesQuery, signal?: AbortSignal) =>
    request<PaginatedDto<LeaveDetailDto>>('/hr/leaves', { token, query: { ...query }, signal }),

  leave: (token: string, id: string, signal?: AbortSignal) => request<LeaveDetailDto>(`/hr/leaves/${id}`, { token, signal }),

  /** An employee's balances for a leave year (the current one when omitted). HR and Admin can read anyone's. */
  balances: (token: string, userId: string, year: number | undefined, signal?: AbortSignal) =>
    request<{ year: number; balances: LeaveBalanceDto[] }>(`/hr/leave-balances/${userId}`, {
      token,
      ...(year !== undefined && { query: { year } }),
      signal,
    }),

  /** Sets one employee's allocation for a paid type and year. A one-off: it does not touch the Leave Master. */
  adjustBalance: (token: string, userId: string, leaveTypeId: string, body: AdjustLeaveBalanceDto) =>
    request<LeaveBalanceDto>(`/hr/leave-balances/${userId}/${leaveTypeId}`, { method: 'PATCH', token, body }),

  leaveTypes: (token: string, signal?: AbortSignal) => request<LeaveTypeDto[]>('/hr/leave-types', { token, signal }),
  createLeaveType: (token: string, body: CreateLeaveTypeDto) =>
    request<LeaveTypeDto>('/hr/leave-types', { method: 'POST', token, body }),
  updateLeaveType: (token: string, id: string, body: UpdateLeaveTypeDto) =>
    request<LeaveTypeDto>(`/hr/leave-types/${id}`, { method: 'PATCH', token, body }),

  /** The Leave Master: every grade × paid-type cell that has been set. */
  policies: (token: string, signal?: AbortSignal) => request<LeavePolicyDto[]>('/hr/leave-policies', { token, signal }),
  setPolicy: (token: string, payBandId: string, leaveTypeId: string, defaultDays: number) =>
    request<LeavePolicyDto>(`/hr/leave-policies/${payBandId}/${leaveTypeId}`, { method: 'PUT', token, body: { defaultDays } }),

  holidays: (token: string, query: ListHolidaysQuery, signal?: AbortSignal) =>
    request<HolidayDto[]>('/hr/holidays', { token, query: { ...query }, signal }),
  createHoliday: (token: string, body: CreateHolidayDto) => request<HolidayDto>('/hr/holidays', { method: 'POST', token, body }),
  deleteHoliday: (token: string, id: string) => request<null>(`/hr/holidays/${id}`, { method: 'DELETE', token }),
};
