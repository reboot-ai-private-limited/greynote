import type { PayrollRunDto, PayrollStatus } from '@greynote/contracts';
import { request } from '../client';

export const payrollApi = {
  /** `month` is `YYYY-MM`. A bare array, capped at 1000. */
  list: (token: string, query: { month: string; status?: PayrollStatus }, signal?: AbortSignal) =>
    request<PayrollRunDto[]>('/payroll', { token, query: { ...query }, signal }),
};
