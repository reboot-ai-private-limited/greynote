import type { DailyPlanChangeDto, DailyPlanDto, MonthlyPlanDto } from '@greynote/contracts';
import { request } from '../client';

export const planningApi = {
  daily: (token: string, id: string, signal?: AbortSignal) => request<DailyPlanDto>(`/planning/daily/${id}`, { token, signal }),
  monthly: (token: string, id: string, signal?: AbortSignal) => request<MonthlyPlanDto>(`/planning/monthly/${id}`, { token, signal }),
  /** One in-day change by its own id: what an approval request points at. */
  change: (token: string, id: string, signal?: AbortSignal) => request<DailyPlanChangeDto>(`/planning/changes/${id}`, { token, signal }),
};
