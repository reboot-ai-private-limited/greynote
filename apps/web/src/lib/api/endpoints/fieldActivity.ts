import type {
  DcrDetailDto,
  DoctorServiceDto,
  ExpenseAuditRowDto,
  ExpensePaymentStatus,
  OverrideGeofenceDto,
} from '@greynote/contracts';
import { request } from '../client';

export const fieldActivityApi = {
  /** `from`/`to` are required (`YYYY-MM-DD`, at most 400 days). A bare array, capped at 500. */
  expenses: (
    token: string,
    query: { from: string; to: string; paymentStatus?: ExpensePaymentStatus },
    signal?: AbortSignal,
  ) => request<ExpenseAuditRowDto[]>('/field-activity/expenses', { token, query: { ...query }, signal }),

  /** One daily report with every call, follow-up and expense: the review screen. */
  dcr: (token: string, id: string, signal?: AbortSignal) => request<DcrDetailDto>(`/field-activity/dcr/${id}`, { token, signal }),

  /** Accepts a call the geofence flagged (FAIL or UNVERIFIED). The reviewing manager or Admin; a reason is required. */
  overrideGeofence: (token: string, dcrId: string, callId: string, body: OverrideGeofenceDto) =>
    request<{ id: string }>(`/field-activity/dcr/${dcrId}/calls/${callId}/override-geofence`, { method: 'POST', token, body }),

  doctorService: (token: string, id: string, signal?: AbortSignal) =>
    request<DoctorServiceDto>(`/field-activity/doctor-services/${id}`, { token, signal }),
};
