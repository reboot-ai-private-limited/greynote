import type { AmendMonthlyPlanDto, DailyPlanDto, GrantLateSubmitDto, LateSubmitGrantDto, MonthlyPlanDetailDto, PaginatedDto, PlanRouteDto } from '@greynote/contracts';
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
  monthly: (token: string, id: string, signal?: AbortSignal) => request<MonthlyPlanDetailDto>(`/planning/monthly/${id}`, { token, signal }),
  /** The routes of the employee a plan belongs to: what an editor may choose from. */
  monthlyRoutes: (token: string, id: string, signal?: AbortSignal) => request<PlanRouteDto[]>(`/planning/monthly/${id}/routes`, { token, signal }),
  /** One employee's plan for a month (`YYYY-MM`); a 404 when there is none. */
  userMonthly: (token: string, userId: string, month: string, signal?: AbortSignal) =>
    request<MonthlyPlanDetailDto>(`/planning/users/${userId}/monthly/${month}`, { token, signal }),
  amendMonthly: (token: string, id: string, body: AmendMonthlyPlanDto) => request<MonthlyPlanDetailDto>(`/planning/monthly/${id}/amend`, { method: 'PATCH', token, body }),
};
