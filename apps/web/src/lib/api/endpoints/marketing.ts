import { request } from '../client';

export interface SetTargetBody {
  userId: string;
  /** `YYYY-MM`, the first month: a month of the current financial year. */
  month: string;
  /** The last month; the same as `month` when left out. */
  toMonth?: string;
  /** `null` = a target for all products. */
  productId: string | null;
  targetAmountPaise: number;
}

export const marketingApi = {
  /** A target over a run of whole months of the current financial year; setting the same range and product again replaces it. */
  setTarget: (token: string, body: SetTargetBody) =>
    request<unknown>('/marketing/targets', { method: 'POST', token, body }),
  deleteTarget: (token: string, id: string) =>
    request<null>(`/marketing/targets/${id}`, { method: 'DELETE', token }),
};
