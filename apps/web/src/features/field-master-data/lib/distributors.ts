import type {
  CreateDistributorDto,
  DistributorDto,
  UpdateDistributorDto,
} from '@greynote/contracts';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { placeErrors } from './chemists';
import {
  EMPTY_COORDINATES,
  locationChange,
  pointFromInputs,
  pointToInputs,
  type CoordinateInputs,
} from './location';

/** The 15-character GST number: 2 digits (state), 5 letters, 4 digits, a letter, a letter or digit, `Z`, a letter or digit. */
export const GST = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const MOBILE = /^\+?\d{10,15}$/;
export const CONTACT_MAX = 150;

export interface DistributorDraft {
  name: string;
  address: string;
  coordinates: CoordinateInputs;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  /** The Zone its Routes are in. Not stored: it only narrows the Routes to choose from, and is worked out from them when editing. */
  zoneId: string;
  routeIds: string[];
  assignedUserIds: string[];
  /** Rupees as typed: what the distributor already owed before this system. Empty = nothing. */
  openingDues: string;
}

export const EMPTY_DISTRIBUTOR: DistributorDraft = {
  name: '',
  address: '',
  coordinates: { ...EMPTY_COORDINATES },
  gstNumber: '',
  contactPerson: '',
  mobile: '',
  zoneId: '',
  routeIds: [],
  assignedUserIds: [],
  openingDues: '',
};

export function distributorToDraft(d: DistributorDto, zoneId = ''): DistributorDraft {
  return {
    name: d.name,
    address: d.address,
    coordinates: pointToInputs(d.location),
    gstNumber: d.gstNumber,
    contactPerson: d.contactPerson,
    mobile: d.mobile,
    zoneId,
    routeIds: d.routeIds,
    assignedUserIds: d.assignedUserIds,
    openingDues: d.openingDuesPaise > 0 ? paiseToRupees(d.openingDuesPaise) : '',
  };
}

export const normalizeGst = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();
/** Spaces and dashes are how people type a number; the API wants digits and an optional leading plus. */
export const normalizeMobile = (raw: string) => raw.replace(/[\s-]/g, '');

function errorsFor(draft: DistributorDraft): Record<string, string | undefined> {
  const gst = normalizeGst(draft.gstNumber);
  const mobile = normalizeMobile(draft.mobile);
  const contact = squash(draft.contactPerson);
  // The shared place rules check the name, the address and the point; the route rule is this form's own (several, in one zone).
  const place = placeErrors(
    { routeId: 'x', name: draft.name, address: draft.address, coordinates: draft.coordinates },
    'distributor name',
  );
  return {
    ...place,
    routeId: undefined,
    gstNumber:
      gst === ''
        ? 'Enter the GST number.'
        : GST.test(gst)
          ? undefined
          : 'A GST number is 15 characters, e.g. 19ABCDE1234F1Z5.',
    contactPerson:
      contact === ''
        ? 'Enter a contact person.'
        : contact.length > CONTACT_MAX
          ? `Keep it to ${CONTACT_MAX} characters.`
          : undefined,
    mobile:
      mobile === ''
        ? 'Enter a mobile number.'
        : MOBILE.test(mobile)
          ? undefined
          : 'Use 10 to 15 digits, with an optional leading +.',
    openingDues: draft.openingDues.trim() !== '' && rupeesToPaise(draft.openingDues) === null ? 'Enter the amount in rupees, e.g. 25000 or 25000.50.' : undefined,
    zoneId: draft.zoneId === '' ? 'Choose a zone.' : undefined,
    routeIds: draft.routeIds.length === 0 ? 'Choose at least one route.' : undefined,
  };
}

/** Adding a distributor is four steps: who it is, where it works and who looks after it, where it sits on the map, and a look over it before it is created. */
export const DISTRIBUTOR_STEPS = ['details', 'coverage', 'location', 'review'] as const;
export type DistributorStep = (typeof DISTRIBUTOR_STEPS)[number];
export const DISTRIBUTOR_STEP_LABEL: Record<DistributorStep, string> = {
  details: 'Details',
  coverage: 'Coverage',
  location: 'Location',
  review: 'Review',
};

const STEP_FIELDS: Record<DistributorStep, readonly string[] | null> = {
  details: ['name', 'gstNumber', 'contactPerson', 'mobile', 'address', 'openingDues'],
  coverage: ['zoneId', 'routeIds'],
  location: ['latitude', 'longitude'],
  review: null,
};

/** What is wrong with the fields of one step (the review step checks everything), so "Next" can say so before moving on. */
export function distributorStepErrors(
  draft: DistributorDraft,
  step: DistributorStep,
): Record<string, string> {
  const fields = STEP_FIELDS[step];
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(errorsFor(draft))) {
    if (message && (fields === null || fields.includes(field))) out[field] = message;
  }
  return out;
}

export function buildDistributor(draft: DistributorDraft): BuildResult<CreateDistributorDto> {
  const errors = errorsFor(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  return {
    ok: true,
    body: {
      routeIds: draft.routeIds,
      name: squash(draft.name),
      gstNumber: normalizeGst(draft.gstNumber),
      contactPerson: squash(draft.contactPerson),
      mobile: normalizeMobile(draft.mobile),
      address: squash(draft.address),
      location: point.point,
      assignedUserIds: draft.assignedUserIds,
      openingDuesPaise: rupeesToPaise(draft.openingDues) ?? 0,
    },
  };
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** Only what changed. The routes and the people are each sent as the whole new list. */
export function buildDistributorUpdate(
  original: DistributorDto,
  draft: DistributorDraft,
): BuildResult<UpdateDistributorDto> {
  const errors = errorsFor(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  const name = squash(draft.name);
  const address = squash(draft.address);
  const contactPerson = squash(draft.contactPerson);
  const gstNumber = normalizeGst(draft.gstNumber);
  const mobile = normalizeMobile(draft.mobile);
  return {
    ok: true,
    body: {
      ...(!sameList(draft.routeIds, original.routeIds) && { routeIds: draft.routeIds }),
      ...(name !== original.name && { name }),
      ...(address !== original.address && { address }),
      ...(gstNumber !== original.gstNumber && { gstNumber }),
      ...(contactPerson !== original.contactPerson && { contactPerson }),
      ...(mobile !== original.mobile && { mobile }),
      ...locationChange(original.location, point.point),
      ...(!sameList(draft.assignedUserIds, original.assignedUserIds) && {
        assignedUserIds: draft.assignedUserIds,
      }),
      ...((rupeesToPaise(draft.openingDues) ?? 0) !== original.openingDuesPaise && {
        openingDuesPaise: rupeesToPaise(draft.openingDues) ?? 0,
      }),
    },
  };
}
