import type { GeoPoint } from '@/types/sync';

import { apiGet, apiPatch, apiPut } from './api';

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
  dateOfBirth?: string | null;
  anniversary?: string | null;
  /** Visits a month (1–6) the MR should make; `null` = none set. */
  visitFrequency?: number | null;
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
  dateOfBirth?: string | null;
  anniversary?: string | null;
  visitFrequency?: number | null;
  location: GeoPoint;
};

export type DoctorTargetsBody = {
  dateOfBirth?: string | null;
  anniversary?: string | null;
  visitFrequency?: number | null;
};

type Page<T> = { items: T[]; total: number };

export const listAddedDoctors = async () =>
  (await apiGet<Page<AddedDoctor>>('/field-master-data/doctors/added?pageSize=50')).items;

export const editAddedDoctor = (id: string, body: AddedDoctorBody) =>
  apiPut<AddedDoctor>(`/field-master-data/doctors/added/${id}`, body);

/** Manager or Admin: set a doctor’s monthly visit frequency (1–6), date of birth and anniversary. */
export const updateDoctorTargets = (id: string, body: DoctorTargetsBody) =>
  apiPatch<unknown>(`/field-master-data/doctors/${id}/targets`, body);

/** A doctor the owner can still change: sent back, withdrawn or reopened. */
export const ADDED_EDITABLE = ['REJECTED', 'WITHDRAWN', 'REOPENED'];

