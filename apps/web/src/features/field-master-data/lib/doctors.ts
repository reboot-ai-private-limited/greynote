import type { CreateDoctorDto, DoctorDto, DoctorImpactDto, DoctorStatus, UpdateDoctorDto } from '@greynote/contracts';
import { istDate } from '@/lib/dates';
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
  /** Optional. */
  clinicName: string;
  phone: string;
  /** `YYYY-MM-DD` or empty. */
  dateOfBirth: string;
  anniversary: string;
  /** `'1'`–`'5'` or empty (no target). */
  visitFrequency: string;
}

export const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: n === 1 ? '1 visit a month' : `${n} visits a month`,
}));

export const EMPTY_DOCTOR: DoctorDraft = {
  routeId: '',
  name: '',
  address: '',
  coordinates: { ...EMPTY_COORDINATES },
  specialty: '',
  qualification: '',
  email: '',
  clinicName: '',
  phone: '',
  dateOfBirth: '',
  anniversary: '',
  visitFrequency: '',
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
    clinicName: d.clinicName ?? '',
    phone: d.phone ?? '',
    dateOfBirth: d.dateOfBirth ?? '',
    anniversary: d.anniversary ?? '',
    visitFrequency: d.visitFrequency === null ? '' : String(d.visitFrequency),
  };
}

function dateError(v: string): string | undefined {
  if (v === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return 'Enter a valid date.';
  return v > istDate() ? 'This date is in the future.' : undefined;
}

function phoneError(v: string): string | undefined {
  const phone = v.replace(/[\s-]/g, '');
  return phone !== '' && !/^\+?\d{10,15}$/.test(phone) ? 'Enter a phone number of 10 to 15 digits.' : undefined;
}

function errorsFor(draft: DoctorDraft): Record<string, string | undefined> {
  const specialty = squash(draft.specialty);
  const qualification = squash(draft.qualification);
  const email = draft.email.trim();
  return {
    ...placeErrors(draft, 'doctor name'),
    specialty:
      specialty === ''
        ? 'Choose a speciality.'
        : specialty.length > TEXT_MAX
          ? `Keep it to ${TEXT_MAX} characters.`
          : undefined,
    qualification:
      qualification === ''
        ? 'Enter a qualification.'
        : qualification.length > TEXT_MAX
          ? `Keep it to ${TEXT_MAX} characters.`
          : undefined,
    email: email !== '' && !EMAIL.test(email) ? 'Enter a valid email address.' : undefined,
    clinicName: squash(draft.clinicName).length > TEXT_MAX ? `Keep it to ${TEXT_MAX} characters.` : undefined,
    phone: phoneError(draft.phone),
    dateOfBirth: dateError(draft.dateOfBirth),
    anniversary: dateError(draft.anniversary),
  };
}

/** Adding a doctor is three steps: the details, where the clinic is on the map, and a look over it all before it is created. */
export const DOCTOR_STEPS = ['details', 'location', 'review'] as const;
export type DoctorStep = (typeof DOCTOR_STEPS)[number];
export const DOCTOR_STEP_LABEL: Record<DoctorStep, string> = {
  details: 'Details',
  location: 'Location',
  review: 'Review',
};

const DETAIL_FIELDS = [
  'routeId',
  'name',
  'address',
  'specialty',
  'qualification',
  'email',
  'clinicName',
  'phone',
  'dateOfBirth',
  'anniversary',
];
const LOCATION_FIELDS = ['latitude', 'longitude'];

/** What is wrong with the fields of one step (the review step checks everything), so "Next" can say so before moving on. */
export function doctorStepErrors(draft: DoctorDraft, step: DoctorStep): Record<string, string> {
  const all = errorsFor(draft);
  const fields = step === 'details' ? DETAIL_FIELDS : step === 'location' ? LOCATION_FIELDS : null;
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(all)) {
    if (message && (fields === null || fields.includes(field))) out[field] = message;
  }
  return out;
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
      clinicName: squash(draft.clinicName) || null,
      phone: draft.phone.replace(/[\s-]/g, '') || null,
      dateOfBirth: draft.dateOfBirth || null,
      anniversary: draft.anniversary || null,
      visitFrequency: draft.visitFrequency === '' ? null : Number(draft.visitFrequency),
      location: point.point,
    },
  };
}

/** Only what changed. An emptied email is sent as `null` (the API reads that as "clear it"). */
export function buildDoctorUpdate(
  original: DoctorDto,
  draft: DoctorDraft,
): BuildResult<UpdateDoctorDto> {
  const errors = errorsFor(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  const name = squash(draft.name);
  const address = squash(draft.address);
  const specialty = squash(draft.specialty);
  const qualification = squash(draft.qualification);
  const email = draft.email.trim() === '' ? null : draft.email.trim();
  const clinicName = squash(draft.clinicName) || null;
  const phone = draft.phone.replace(/[\s-]/g, '') || null;
  const dateOfBirth = draft.dateOfBirth || null;
  const anniversary = draft.anniversary || null;
  const visitFrequency = draft.visitFrequency === '' ? null : Number(draft.visitFrequency);
  return {
    ok: true,
    body: {
      ...(draft.routeId !== original.routeId && { routeId: draft.routeId }),
      ...(name !== original.name && { name }),
      ...(address !== original.address && { address }),
      ...(specialty !== original.specialty && { specialty }),
      ...(qualification !== original.qualification && { qualification }),
      ...(email !== original.email && { email }),
      ...(clinicName !== original.clinicName && { clinicName }),
      ...(phone !== original.phone && { phone }),
      ...(dateOfBirth !== original.dateOfBirth && { dateOfBirth }),
      ...(anniversary !== original.anniversary && { anniversary }),
      ...(visitFrequency !== original.visitFrequency && { visitFrequency }),
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

/** Where a pending doctor's approval is decided: its own request, or the NEW_DOCTOR queue if the request isn't known. */
export const pendingApprovalHref = (d: Pick<DoctorDto, 'approvalRequestId'>): string =>
  d.approvalRequestId ? `/approvals/${d.approvalRequestId}` : '/approvals?kind=NEW_DOCTOR';

/** True for an MR-added Doctor whose phone point differs from the registered one: Admin has corrected it. */
export function locationWasCorrected(d: Pick<DoctorDto, 'location' | 'capturedLocation'>): boolean {
  if (!d.location || !d.capturedLocation) return false;
  return (
    d.location.latitude !== d.capturedLocation.latitude ||
    d.location.longitude !== d.capturedLocation.longitude
  );
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The warning before a doctor is deactivated or deleted (decision-log 2026-10-22), in three groups; only what is not zero is shown.
 * `changes`: what happens now. `open`: what stays and Admin may want to close. `history`: kept as it is.
 */
export function doctorImpactLines(impact: DoctorImpactDto, action: 'deactivate' | 'delete'): { changes: string[]; open: string[]; history: string[] } {
  const { assignedTo, plannedDays } = impact;
  const changes = [
    assignedTo ? `${assignedTo.name}${assignedTo.employeeCode ? ` (${assignedTo.employeeCode})` : ''} loses this doctor: the assignment ends` : '',
    plannedDays.editable > 0 ? `It is taken off ${count(plannedDays.editable, 'plan')} from today that ${plannedDays.editable === 1 ? 'is' : 'are'} not submitted yet` : '',
    action === 'delete' ? 'The doctor is removed for good and kept only in the archive' : '',
  ].filter(Boolean);
  const open = [
    plannedDays.locked > 0 ? `${count(plannedDays.locked, 'submitted or approved plan')} from today keep${plannedDays.locked === 1 ? 's' : ''} it, but it can’t be called` : '',
    impact.openGifts > 0 ? `${count(impact.openGifts, 'gift')} not handed over yet` : '',
    impact.openServices > 0 ? `${count(impact.openServices, 'service')} not done yet` : '',
    impact.samplesRemaining > 0 ? `${count(impact.samplesRemaining, 'sample unit')} left on ${count(impact.sampleAllocations, 'allocation')}` : '',
    impact.visuals > 0 ? `${count(impact.visuals, 'visual')} picked for it` : '',
  ].filter(Boolean);
  const history = [impact.calls > 0 ? `${count(impact.calls, 'past call')} keep${impact.calls === 1 ? 's' : ''} showing it` : ''].filter(Boolean);
  return { changes, open, history };
}

