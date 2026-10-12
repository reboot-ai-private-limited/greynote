import type { DailyPlanChangeDto, DailyPlanDto, GrantLateSubmitDto, LateSubmitGrantDto, MonthlyPlanDto, PaginatedDto } from '@greynote/contracts';
import { request } from '../client';

export interface ListLateGrantsQuery {
  page: number;
  pageSize: number;
  userId?: string | undefined;
  kind?: 'DAILY_PLAN' | 'MONTHLY_PLAN' | undefined;
}

export const planningApi = {
  lateGrants: (token: string, query: ListLateGrantsQuery, signal?: AbortSignal) =>
    request<PaginatedDto<LateSubmitGrantDto>>('/planning/late-grants', { token, query: { ...query }, signal }),
  grantLate: (token: string, body: GrantLateSubmitDto) => request<LateSubmitGrantDto>('/planning/late-grants', { method: 'POST', token, body }),
  revokeLate: (token: string, id: string) => request<LateSubmitGrantDto>(`/planning/late-grants/${id}/revoke`, { method: 'POST', token }),
  daily: (token: string, id: string, signal?: AbortSignal) => request<DailyPlanDto>(`/planning/daily/${id}`, { token, signal }),
  monthly: (token: string, id: string, signal?: AbortSignal) => request<MonthlyPlanDto>(`/planning/monthly/${id}`, { token, signal }),
  /** One in-day change by its own id: what an approval request points at. */
  change: (token: string, id: string, signal?: AbortSignal) => request<DailyPlanChangeDto>(`/planning/changes/${id}`, { token, signal }),
};
