import type { DoctorVisualListDto, UpdateVisualDto, VisualDto } from '@greynote/contracts';
import { request } from '../client';

export interface SetTargetBody {
  userId: string;
  /** `YYYY-MM`, the first month: a month of the current financial year. */
  month: string;
  /** The last month; the same as `month` when left out. */
  toMonth?: string;
  /** `null` = a target for all products. */
  productId: string | null;
  /** Give an amount or units; for a product target the other follows from its PTR. */
  targetAmountPaise?: number;
  /** Units: a product target only. */
  targetQty?: number;
}

export const marketingApi = {
  /** Admin sees every visual, filtered by status and product; the API returns up to 500 in one list. */
  listVisuals: (
    token: string,
    query: { status?: 'active' | 'inactive'; productId?: string } = {},
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams(query as Record<string, string>).toString();
    return request<VisualDto[]>(`/marketing/visuals${qs ? `?${qs}` : ''}`, { token, signal });
  },
  /** Multipart: the text fields first, then the file under `file`. */
  uploadVisual: (token: string, body: FormData) =>
    request<VisualDto>('/marketing/visuals', { method: 'POST', token, body }),
  updateVisual: (token: string, id: string, body: UpdateVisualDto) =>
    request<VisualDto>(`/marketing/visuals/${id}`, { method: 'PATCH', token, body }),
  doctorVisuals: (token: string, doctorId: string, signal?: AbortSignal) =>
    request<DoctorVisualListDto>(`/marketing/doctors/${doctorId}/visuals`, { token, signal }),
  /** Adds library visuals to a doctor's list: the doctor's MR, a manager above them, or Admin. */
  addDoctorVisuals: (token: string, doctorId: string, visualIds: string[]) =>
    request<unknown>(`/marketing/doctors/${doctorId}/visuals`, { method: 'POST', token, body: { visualIds } }),
  removeDoctorVisual: (token: string, doctorId: string, visualId: string) =>
    request<null>(`/marketing/doctors/${doctorId}/visuals/${visualId}`, {
      method: 'DELETE',
      token,
    }),

  /** A target over a run of whole months of the current financial year; setting the same range and product again replaces it. */
  setTarget: (token: string, body: SetTargetBody) =>
    request<unknown>('/marketing/targets', { method: 'POST', token, body }),
  deleteTarget: (token: string, id: string) =>
    request<null>(`/marketing/targets/${id}`, { method: 'DELETE', token }),
};
