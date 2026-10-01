import type { LeaveRequestDto, PaginatedDto } from '@greynote/contracts';
import { request } from '../client';

export const hrApi = {
  /** Leaves overlapping `from`–`to` (`YYYY-MM-DD`). There is no status filter. */
  leaves: (token: string, query: { from: string; to: string; pageSize?: number }, signal?: AbortSignal) =>
    request<PaginatedDto<LeaveRequestDto>>('/hr/leaves', { token, query: { ...query }, signal }),
};
