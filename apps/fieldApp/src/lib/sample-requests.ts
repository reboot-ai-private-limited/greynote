import { apiGet, apiPost } from './api';

export type SampleKind = 'SAMPLE' | 'LBL';
export type SampleRequestStatus = 'REQUESTED' | 'DONE' | 'CANCELLED';

export type SampleRequestView = {
  id: string;
  userId: string;
  userName: string;
  kind: SampleKind;
  lines: { productId: string; productName: string; quantity: number; creditedQuantity: number | null }[];
  remarks: string | null;
  status: SampleRequestStatus;
  requestedAt: string;
  doneAt: string | null;
};

export type SampleBalanceRow = { productId: string; productName: string; requested: number; credited: number; given: number; left: number };
export type SampleAccount = { userId: string; userName: string; samples: SampleBalanceRow[]; lbl: SampleBalanceRow[]; requests: SampleRequestView[] };

/** Online only. */
export const createSampleRequest = (body: { kind: SampleKind; lines: { productId: string; quantity: number }[]; remarks: string | null }) =>
  apiPost<SampleRequestView>('/field-activity/sample-requests', body, { auth: true });
export const listMySampleRequests = () => apiGet<SampleRequestView[]>('/field-activity/sample-requests/mine', { auth: true });
export const cancelSampleRequest = (id: string) => apiPost<null>(`/field-activity/sample-requests/${id}/cancel`, {}, { auth: true });
/** My account, or (`userId`) a person below me: requested, credited, given and left, per product. */
export const getSampleAccount = (userId?: string) =>
  apiGet<SampleAccount>(`/field-activity/sample-account${userId ? `?userId=${userId}` : ''}`, { auth: true });

export const statusText = (s: SampleRequestStatus): string => (s === 'REQUESTED' ? 'Waiting' : s === 'DONE' ? 'Done · credited' : 'Cancelled');
