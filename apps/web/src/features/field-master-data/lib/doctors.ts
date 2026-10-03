import type { CreateDoctorDto, DoctorDto, DoctorStatus, UpdateDoctorDto } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import type { BadgeTone } from '@/components/ui/Badge';
import { placeErrors, type PlaceDraft } from './chemists';
import { EMPTY_COORDINATES, locationChange, pointFromInputs, pointToInputs } from './location';

export const CATEGORY_MAX = 100;
export const TEXT_MAX = 150;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DoctorDraft extends PlaceDraft {
  category: string;
  specialty: string;
  qualification: string;
  email: string;
}

export const EMPTY_DOCTOR: DoctorDraft = {
  routeId: '',
  name: '',
  address: '',
  coordinates: { ...EMPTY_COORDINATES },
  category: '',
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
    category: d.category,
    specialty: d.specialty,
    qualification: d.qualification,
    email: d.email ?? '',
  };
}

function errorsFor(draft: DoctorDraft): Record<string, string | undefined> {
  const category = squash(draft.category);
  const specialty = squash(draft.specialty);
  const qualification = squash(draft.qualification);
  const email = draft.email.trim();
  return {
    ...placeErrors(draft, 'doctor name'),
    category: category === '' ? 'Enter a category.' : category.length > CATEGORY_MAX ? `Keep it to ${CATEGORY_MAX} characters.` : undefined,
    specialty: specialty === '' ? 'Enter a specialty.' : specialty.length > TEXT_MAX ? `Keep it to ${TEXT_MAX} characters.` : undefined,
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
      category: squash(draft.category),
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
  const category = squash(draft.category);
  const name = squash(draft.name);
  const address = squash(draft.address);
  const specialty = squash(draft.specialty);
  const qualification = squash(draft.qualification);
  const email = draft.email.trim() === '' ? null : draft.email.trim();
  return {
    ok: true,
    body: {
      ...(draft.routeId !== original.routeId && { routeId: draft.routeId }),
      ...(category !== original.category && { category }),
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

/** The distinct categories in use, sorted: the filter's options and the form's suggestions. */
export function distinctCategories(doctors: readonly Pick<DoctorDto, 'category'>[]): string[] {
  return [...new Set(doctors.map((d) => d.category))].sort((a, b) => a.localeCompare(b));
}

/** True for an MR-added Doctor whose phone point differs from the registered one: Admin has corrected it. */
export function locationWasCorrected(d: Pick<DoctorDto, 'location' | 'capturedLocation'>): boolean {
  if (!d.location || !d.capturedLocation) return false;
  return d.location.latitude !== d.capturedLocation.latitude || d.location.longitude !== d.capturedLocation.longitude;
}
