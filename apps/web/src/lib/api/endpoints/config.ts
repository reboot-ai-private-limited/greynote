import type { ConfigSettingDto, FinancialYearCloseDto, PublicConfigDto, UpdateConfigDto } from '@greynote/contracts';
import { request } from '../client';

export const configApi = {
  /** Admin: every setting with its value, rules, default and impact. */
  list: (token: string, signal?: AbortSignal) => request<ConfigSettingDto[]>('/config', { token, signal }),

  /**
   * Admin: changes one setting. A value that breaks its rules is a 400 naming the rule, and what is stored is the checked, normalised
   * form (a month in capitals, a time as `HH:MM`).
   */
  update: (token: string, key: string, body: UpdateConfigDto) =>
    request<{ key: string; value: string; updatedBy: string | null; updatedAt: string }>(`/config/${key}`, { method: 'PATCH', token, body }),

  /** Admin: the closed financial years and the ended ones that can still be closed. */
  financialYear: (token: string, signal?: AbortSignal) => request<FinancialYearCloseDto>('/config/financial-year', { token, signal }),
  /** Admin: closes an ended year; payroll and expense payments for its months are then refused. */
  closeYear: (token: string, year: number) => request<FinancialYearCloseDto>('/config/financial-year/close', { method: 'POST', token, body: { year } }),
  /** Admin: reopens a closed year. */
  reopenYear: (token: string, year: number) => request<FinancialYearCloseDto>('/config/financial-year/reopen', { method: 'POST', token, body: { year } }),

  /** Any signed-in user: the financial-year start month and the business timezone. */
  publicSettings: (token: string, signal?: AbortSignal) => request<PublicConfigDto>('/config/public', { token, signal }),
};
