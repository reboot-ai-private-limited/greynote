import type { DoctorVisualListDto, UpdateVisualDto, VisualDto } from '@greynote/contracts';
import { request } from '../client';

export interface SetTargetBody {
  userId: string;
  /** `YYYY-MM`, the first month: a month of the current financial year. */
  month: string;
  /** The last month; the same as `month` when left out. */
  toMonth?: string;
  /** A product is required: a target is set per product (an old all-products one can only be split). */
  productId: string | null;
  /** Give an amount or units; for a product target the other follows from its PTS. */
  targetAmountPaise?: number;
  /** Units: a product target only. */
  targetQty?: number;
}

/** One product's line in a bulk set or a split: an amount (or, for a bulk set, units). */
export interface TargetLineBody {
  productId: string;
  targetAmountPaise?: number;
  targetQty?: number;
}

/** `POST /marketing/targets/bulk`: one run of months, several products. */
export interface SetTargetsBulkBody {
  userId: string;
  month: string;
  toMonth?: string;
  items: TargetLineBody[];
}

/** `PATCH /marketing/targets/:id`: the target as it should now be. The employee stays, so it isn't sent. */
export type UpdateTargetBody = Omit<SetTargetBody, 'userId'>;

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
  /** Puts a new image on a visual (Admin); the old file is removed from Cloudinary. `body` carries the file under `file`. */
  replaceVisualFile: (token: string, id: string, body: FormData) =>
    request<VisualDto>(`/marketing/visuals/${id}/file`, { method: 'POST', token, body }),
  visualDeleteImpact: (token: string, id: string, signal?: AbortSignal) =>
    request<{ id: string; title: string; doctors: number }>(`/marketing/visuals/${id}/delete-impact`, { token, signal }),
  /** Deletes the visual for good: its row, every doctor's pick of it and its file in Cloudinary. */
  deleteVisual: (token: string, id: string) => request<null>(`/marketing/visuals/${id}`, { method: 'DELETE', token }),
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
  /** Targets for several products over one run of months, all or nothing; `409 TARGET_CLASH` names a product that already has a target over exactly those months. */
  setTargetsBulk: (token: string, body: SetTargetsBulkBody) => request<unknown>('/marketing/targets/bulk', { method: 'POST', token, body }),
  /** Splits an old all-products target across products; the amounts must add up to it. */
  splitTarget: (token: string, id: string, items: TargetLineBody[]) => request<unknown>(`/marketing/targets/${id}/split`, { method: 'POST', token, body: { items } }),
  /** Edits a target in place (months, product, amount or units); `409 TARGET_CLASH` if another target already has that product and months. */
  updateTarget: (token: string, id: string, body: UpdateTargetBody) =>
    request<unknown>(`/marketing/targets/${id}`, { method: 'PATCH', token, body }),
  deleteTarget: (token: string, id: string) =>
    request<null>(`/marketing/targets/${id}`, { method: 'DELETE', token }),
};
