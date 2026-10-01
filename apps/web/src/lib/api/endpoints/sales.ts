import type { MissingStockRowDto } from '@greynote/contracts';
import { request } from '../client';

export const salesApi = {
  /** ADMIN only (HR and Accountant get 403). `month` is `YYYY-MM`. */
  missingStock: (token: string, query: { month: string }, signal?: AbortSignal) =>
    request<MissingStockRowDto[]>('/sales/monthly-stock/missing', { token, query: { ...query }, signal }),
};
