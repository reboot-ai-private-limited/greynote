import type { ExpenseAuditRowDto, ExpensePaymentStatus } from '@greynote/contracts';
import { request } from '../client';

export const fieldActivityApi = {
  /** `from`/`to` are required (`YYYY-MM-DD`, at most 400 days). A bare array, capped at 500. */
  expenses: (
    token: string,
    query: { from: string; to: string; paymentStatus?: ExpensePaymentStatus },
    signal?: AbortSignal,
  ) => request<ExpenseAuditRowDto[]>('/field-activity/expenses', { token, query: { ...query }, signal }),
};
