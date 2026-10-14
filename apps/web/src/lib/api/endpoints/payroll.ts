import type { AdjustPayrollAmountDto, GenerateOutcomeDto, GeneratePayrollDto, OverridePayrollDayDto, PaidMonthTotalDto, PayPayrollDto, PayrollRunDto, PayrollStatus, PayrollWarningsDto } from '@greynote/contracts';
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

  /** Who is missing an ESI (at or under the wage ceiling) or EPF number for the month. A warning only. */
  warnings: (token: string, month: string, signal?: AbortSignal) => request<PayrollWarningsDto>('/payroll/warnings', { token, query: { month }, signal }),

  /** Admin, Accountant: the total salary marked paid, month by month, for the financial year in view. */
  paidTotals: (token: string, signal?: AbortSignal) => request<PaidMonthTotalDto[]>('/payroll/paid-totals', { token, signal }),

  get: (token: string, id: string, signal?: AbortSignal) => request<PayrollRunDto>(`/payroll/${id}`, { token, signal }),

  /**
   * Generates or recomputes the DRAFT sheet for a month that has ended: every active field employee, or the ids given. One line per
   * employee; a finalized run is skipped, never overwritten (a single named employee already finalized is a 409).
   */
  generate: (token: string, body: GeneratePayrollDto) =>
    request<GenerateOutcomeDto[]>('/payroll/generate', { method: 'POST', token, body }),

  /** HR, Admin: charge one day of a DRAFT 0, a half or a whole day instead of what the rules gave. A reason is required. */
  overrideDay: (token: string, id: string, body: OverridePayrollDayDto) => request<PayrollRunDto>(`/payroll/${id}/days`, { method: 'POST', token, body }),
  /** HR, Admin: add (positive) or take off (negative) an amount on a DRAFT. A reason is required. */
  adjustAmount: (token: string, id: string, body: AdjustPayrollAmountDto) => request<PayrollRunDto>(`/payroll/${id}/adjustments`, { method: 'POST', token, body }),
  /** Accountant, Admin: marks a FINALIZED run's salary paid, once, with an optional reference. */
  pay: (token: string, id: string, body: PayPayrollDto) => request<PayrollRunDto>(`/payroll/${id}/pay`, { method: 'POST', token, body }),

  /** Locks a DRAFT, once. A second call is a 409. */
  finalize: (token: string, id: string) => request<PayrollRunDto>(`/payroll/${id}/finalize`, { method: 'POST', token }),
};
