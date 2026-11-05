import type { GeoPoint } from '@/types/sync';

import { apiGet, apiPut } from './api';

/**
 * The chemists an employee added (docs/mobile/chemists.md): created `pending` and decided by the employee's manager or Admin —
 * either one, in a single stage — then `active`. A pending chemist can't be called on or ordered for. A rejected, withdrawn or
 * reopened one can be corrected and sent again — online only, and the phone's location is captured again.
 */
export type AddedChemist = {
  id: string;
  routeId: string;
  name: string;
  address: string;
  /** `null` when not set (absent from older servers). */
  phone?: string | null;
  location: GeoPoint | null;
  /** `pending` until approved. */
  status: 'pending' | 'active' | 'inactive';
  approval: { requestId: string; cycle: number; status: string } | null;
};

/** Sending again replaces the details: a `phone` of `null`, or one left out, clears the number. */
export type AddedChemistBody = { routeId: string; name: string; address: string; phone: string | null; location: GeoPoint };

type Page<T> = { items: T[]; total: number };

export const listAddedChemists = async () =>
  (await apiGet<Page<AddedChemist>>('/field-master-data/chemists/added?pageSize=50')).items;

export const editAddedChemist = (id: string, body: AddedChemistBody) =>
  apiPut<AddedChemist>(`/field-master-data/chemists/added/${id}`, body);
