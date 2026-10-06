import type { CreateDoctorDto, DoctorDto, DoctorStatus, UpdateDoctorDto } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import type { BadgeTone } from '@/components/ui/Badge';
import { placeErrors, type PlaceDraft } from './chemists';
import { EMPTY_COORDINATES, locationChange, pointFromInputs, pointToInputs } from './location';

export const TEXT_MAX = 150;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DoctorDraft extends PlaceDraft {
  /** One of the Admin's list (see Specialities). */
  specialty: string;
  qualification: string;
  email: string;
}

export const EMPTY_DOCTOR: DoctorDraft = {
  routeId: '',
  name: '',
  address: '',
  coordinates: { ...EMPTY_COORDINATES },
  specialty: '',
  qualification: '',
  email: '',
};

export function doctorToDraft(d: DoctorDto): DoctorDraft {
  return {
    routeId: d.routeId,
    name: d.name,
    address: d.address,
    coordinates: pointToInputs(d.location),
    specialty: d.specialty,
    qualification: d.qualification,
    email: d.email ?? '',
  };
}

function errorsFor(draft: DoctorDraft): Record<string, string | undefined> {
  const specialty = squash(draft.specialty);
  const qualification = squash(draft.qualification);
  const email = draft.email.trim();
  return {
    ...placeErrors(draft, 'doctor name'),
    specialty: specialty === '' ? 'Choose a speciality.' : specialty.length > TEXT_MAX ? `Keep it to ${TEXT_MAX} characters.` : undefined,
    qualification: qualification === '' ? 'Enter a qualification.' : qualification.length > TEXT_MAX ? `Keep it to ${TEXT_MAX} characters.` : undefined,
    email: email !== '' && !EMAIL.test(email) ? 'Enter a valid email address.' : undefined,
  };
}

export function buildDoctor(draft: DoctorDraft): BuildResult<CreateDoctorDto> {
  const errors = errorsFor(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  return {
    ok: true,
    body: {
      routeId: draft.routeId,
      name: squash(draft.name),
      address: squash(draft.address),
      specialty: squash(draft.specialty),
      qualification: squash(draft.qualification),
      email: draft.email.trim() === '' ? null : draft.email.trim(),
      location: point.point,
    },
  };
}

/** Only what changed. An emptied email is sent as `null` (the API reads that as "clear it"). */
export function buildDoctorUpdate(original: DoctorDto, draft: DoctorDraft): BuildResult<UpdateDoctorDto> {
  const errors = errorsFor(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  const name = squash(draft.name);
  const address = squash(draft.address);
  const specialty = squash(draft.specialty);
  const qualification = squash(draft.qualification);
  const email = draft.email.trim() === '' ? null : draft.email.trim();
  return {
    ok: true,
    body: {
      ...(draft.routeId !== original.routeId && { routeId: draft.routeId }),
      ...(name !== original.name && { name }),
      ...(address !== original.address && { address }),
      ...(specialty !== original.specialty && { specialty }),
      ...(qualification !== original.qualification && { qualification }),
      ...(email !== original.email && { email }),
      ...locationChange(original.location, point.point),
    },
  };
}

export const DOCTOR_STATUS_LABEL: Record<DoctorStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  pending: 'Awaiting approval',
};

export const DOCTOR_STATUS_TONE: Record<DoctorStatus, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  pending: 'warning',
};

/** Admin can move a Doctor between active and inactive; a pending one is the approval's to decide. */
export function canToggleStatus(status: DoctorStatus): boolean {
  return status !== 'pending';
}

/** True for an MR-added Doctor whose phone point differs from the registered one: Admin has corrected it. */
export function locationWasCorrected(d: Pick<DoctorDto, 'location' | 'capturedLocation'>): boolean {
  if (!d.location || !d.capturedLocation) return false;
  return d.location.latitude !== d.capturedLocation.latitude || d.location.longitude !== d.capturedLocation.longitude;
}
