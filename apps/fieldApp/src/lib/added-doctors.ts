import type { GeoPoint } from '@/types/sync';

import { apiGet, apiPut } from './api';

/**
 * The doctors an MR added (LLD field-master-data.md, Doctor-creation approval): created `pending`, sent
 * to the manager and then Admin, and `active` once approved. A rejected or withdrawn one can be changed
 * and sent again — online only, and the phone's location is captured again.
 */
export type AddedDoctor = {
  id: string;
  routeId: string;
  name: string;
  address: string;
  email: string | null;
  specialty: string;
  qualification: string;
  location: GeoPoint | null;
  /** `pending` until approved. */
  status: 'pending' | 'active' | 'inactive';
  approval: { requestId: string; cycle: number; status: string } | null;
};

export type AddedDoctorBody = {
  routeId: string;
  name: string;
  address: string;
  specialty: string;
  qualification: string;
  email: string | null;
  location: GeoPoint;
};

type Page<T> = { items: T[]; total: number };

export const listAddedDoctors = async () =>
  (await apiGet<Page<AddedDoctor>>('/field-master-data/doctors/added?pageSize=50')).items;

export const editAddedDoctor = (id: string, body: AddedDoctorBody) =>
  apiPut<AddedDoctor>(`/field-master-data/doctors/added/${id}`, body);

/** A doctor the owner can still change: sent back, withdrawn or reopened. */
export const ADDED_EDITABLE = ['REJECTED', 'WITHDRAWN', 'REOPENED'];
