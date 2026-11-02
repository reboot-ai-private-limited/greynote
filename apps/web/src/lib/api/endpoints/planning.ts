import type { AmendMonthlyPlanDto, DailyPlanDto, MonthlyPlanDetailDto, PlanRouteDto } from '@greynote/contracts';
import { request } from '../client';

export const planningApi = {
  daily: (token: string, id: string, signal?: AbortSignal) => request<DailyPlanDto>(`/planning/daily/${id}`, { token, signal }),
  monthly: (token: string, id: string, signal?: AbortSignal) => request<MonthlyPlanDetailDto>(`/planning/monthly/${id}`, { token, signal }),
  /** The routes of the employee a plan belongs to: what an editor may choose from. */
  monthlyRoutes: (token: string, id: string, signal?: AbortSignal) => request<PlanRouteDto[]>(`/planning/monthly/${id}/routes`, { token, signal }),
  /** One employee's plan for a month (`YYYY-MM`); a 404 when there is none. */
  userMonthly: (token: string, userId: string, month: string, signal?: AbortSignal) =>
    request<MonthlyPlanDetailDto>(`/planning/users/${userId}/monthly/${month}`, { token, signal }),
  deleteMonthly: (token: string, id: string) => request<null>(`/planning/monthly/${id}`, { method: 'DELETE', token }),
  amendMonthly: (token: string, id: string, body: AmendMonthlyPlanDto) => request<MonthlyPlanDetailDto>(`/planning/monthly/${id}/amend`, { method: 'PATCH', token, body }),
};
