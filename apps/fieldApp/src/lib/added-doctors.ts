import type { GeoPoint } from '@/types/sync';

import { apiGet, apiPatch, apiPut } from './api';

/**
 * The doctors an MR added (docs/mobile/doctors.md): created `pending` and decided by the employee's manager or Admin — either
 * one, in a single stage — then `active`. The approver may correct any detail and the location first, so after approval the
 * approved values are shown. A rejected, withdrawn or reopened one can be changed and sent again — online only, and the phone's
 * location is captured again.
 */
export type AddedDoctor = {
  id: string;
  routeId: string;
  name: string;
  address: string;
  email: string | null;
  clinicName?: string | null;
  phone?: string | null;
  specialty: string;
  qualification: string;
  location: GeoPoint | null;
  dateOfBirth?: string | null;
  anniversary?: string | null;
  /** Visits a month (1–4) the MR should make; `null` = none set. */
  visitFrequency?: number | null;
  /** The doctor's photo, or `null` (show initials). Absent from older servers. */
  photoUrl?: string | null;
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
  clinicName?: string | null;
  phone?: string | null;
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

/** Manager or Admin: set a doctor’s monthly visit frequency (1–4), date of birth and anniversary. */
export const updateDoctorTargets = (id: string, body: DoctorTargetsBody) =>
  apiPatch<unknown>(`/field-master-data/doctors/${id}/targets`, body);

/** A doctor the owner can still change: sent back, withdrawn or reopened. */
export const ADDED_EDITABLE = ['REJECTED', 'WITHDRAWN', 'REOPENED'];


/** What an approver may correct on a doctor that is waiting for approval. Send only what changed; `null` clears an optional detail. */
export type ReviewDoctorBody = Partial<{
  name: string;
  address: string;
  specialty: string;
  qualification: string;
  email: string | null;
  clinicName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  anniversary: string | null;
  visitFrequency: number | null;
  location: GeoPoint;
}>;

/** Manager or Admin: correct a pending doctor (any detail and its location) before approving. Online only. */
export const reviewDoctor = (id: string, body: ReviewDoctorBody) => apiPatch<unknown>(`/field-master-data/doctors/${id}/review`, body);

/** A doctor assigned to someone in a manager's team, as `GET /field-master-data/doctors/team` returns it. */
export type TeamDoctor = {
  id: string;
  name: string;
  specialty: string;
  clinicName?: string | null;
  dateOfBirth?: string | null;
  anniversary?: string | null;
  visitFrequency?: number | null;
  /** The doctor's photo, or `null` (show initials). Absent from older servers. */
  photoUrl?: string | null;
  assignedTo: { userId: string; name: string; employeeCode: string } | null;
};

export const listTeamDoctors = async (userId: string, search?: string) =>
  (await apiGet<Page<TeamDoctor>>(`/field-master-data/doctors/team?userId=${userId}&pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}`)).items;
