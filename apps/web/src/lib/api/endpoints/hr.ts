import type { LeaveBalanceDto, LeaveDetailDto, LeaveRequestDto, PaginatedDto } from '@greynote/contracts';
import { request } from '../client';

export const hrApi = {
  /** Leaves overlapping `from`–`to` (`YYYY-MM-DD`). There is no status filter. */
  leaves: (token: string, query: { from: string; to: string; pageSize?: number }, signal?: AbortSignal) =>
    request<PaginatedDto<LeaveRequestDto>>('/hr/leaves', { token, query: { ...query }, signal }),

  leave: (token: string, id: string, signal?: AbortSignal) => request<LeaveDetailDto>(`/hr/leaves/${id}`, { token, signal }),

  /** An employee's balances for a leave year (the current one when omitted). HR and Admin can read anyone's. */
  balances: (token: string, userId: string, year: number | undefined, signal?: AbortSignal) =>
    request<{ year: number; balances: LeaveBalanceDto[] }>(`/hr/leave-balances/${userId}`, {
      token,
      ...(year !== undefined && { query: { year } }),
      signal,
    }),
};
