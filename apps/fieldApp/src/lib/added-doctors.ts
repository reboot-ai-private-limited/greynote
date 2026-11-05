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
  routeId: string;
  name: string;
  address: string;
  location: GeoPoint | null;
  specialty: string;
  clinicName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  anniversary?: string | null;
  visitFrequency?: number | null;
  /** The doctor's photo, or `null` (show initials). Absent from older servers. */
  photoUrl?: string | null;
  assignedTo: { userId: string; name: string; employeeCode: string } | null;
};

/** Every doctor assigned to anyone in the manager's team, at any depth (`userId` left out). Reads up to 20 pages of 100. */
export const listAllTeamDoctors = async (): Promise<TeamDoctor[]> => {
  const all: TeamDoctor[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await apiGet<Page<TeamDoctor>>(`/field-master-data/doctors/team?page=${page}&pageSize=100`);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
};

/** What is left to give a doctor. The snapshot has this for the employee's own doctors only; a manager reads a team doctor's here. */
export const listDoctorSamples = (doctorId: string) =>
  apiGet<{ productId: string; quantityRemaining: number }[]>(`/field-master-data/doctors/${doctorId}/sample-allocations`);

export const listTeamDoctors = async (userId: string, search?: string) =>
  (await apiGet<Page<TeamDoctor>>(`/field-master-data/doctors/team?userId=${userId}&pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}`)).items;

/** A doctor row for the service request picker, from either feed. */
export type PickerDoctor = { id: string; name: string; subtitle: string; photoUrl: string | null };

export const PICKER_PAGE_SIZE = 20;

/**
 * One page of the service request form's doctor picker (docs/mobile/service-requests.md §2). An MR reads `doctors/mine`
 * (search matches the doctor's name); a manager reads `doctors/team` (also matches the assigned MR's name or code). The
 * server returns active doctors only. `search` is left out when empty.
 */
export const searchPickerDoctors = async (manager: boolean, search: string, page: number): Promise<{ items: PickerDoctor[]; total: number }> => {
  const q = search.trim();
  const params = `page=${page}&pageSize=${PICKER_PAGE_SIZE}${q ? `&search=${encodeURIComponent(q.slice(0, 100))}` : ''}`;
  if (manager) {
    const res = await apiGet<Page<TeamDoctor>>(`/field-master-data/doctors/team?${params}`);
    return {
      total: res.total,
      items: res.items.map((t) => ({
        id: t.id,
        name: t.name,
        subtitle: t.assignedTo ? `${t.assignedTo.name} (${t.assignedTo.employeeCode})` : (t.clinicName ?? t.specialty),
        photoUrl: t.photoUrl ?? null,
      })),
    };
  }
  type MineDoctor = { id: string; name: string; specialty?: string; clinicName?: string | null; address?: string | null; photoUrl?: string | null };
  const res = await apiGet<Page<MineDoctor>>(`/field-master-data/doctors/mine?${params}`);
  return {
    total: res.total,
    items: res.items.map((d) => ({ id: d.id, name: d.name, subtitle: d.address ?? d.clinicName ?? d.specialty ?? '', photoUrl: d.photoUrl ?? null })),
  };
};
