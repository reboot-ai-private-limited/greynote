import type { GenerateOutcomeDto, GeneratePayrollDto, PayrollRunDto, PayrollStatus } from '@greynote/contracts';
import { request } from '../client';

export interface ListPayrollQuery {
  /** `YYYY-MM`: one month, or `fromMonth`/`toMonth` for a range. */
  month?: string | undefined;
  fromMonth?: string | undefined;
  toMonth?: string | undefined;
  userId?: string | undefined;
  status?: PayrollStatus | undefined;
}

export const payrollApi = {
  /** A bare array, capped at 1000, each row with the employee's name and code. */
  list: (token: string, query: ListPayrollQuery, signal?: AbortSignal) =>
    request<PayrollRunDto[]>('/payroll', { token, query: { ...query }, signal }),

  get: (token: string, id: string, signal?: AbortSignal) => request<PayrollRunDto>(`/payroll/${id}`, { token, signal }),

  /**
   * Generates or recomputes the DRAFT sheet for a month that has ended: every active field employee, or the ids given. One line per
   * employee; a finalized run is skipped, never overwritten (a single named employee already finalized is a 409).
   */
  generate: (token: string, body: GeneratePayrollDto) =>
    request<GenerateOutcomeDto[]>('/payroll/generate', { method: 'POST', token, body }),

  /** Locks a DRAFT, once. A second call is a 409. */
  finalize: (token: string, id: string) => request<PayrollRunDto>(`/payroll/${id}/finalize`, { method: 'POST', token }),
};
