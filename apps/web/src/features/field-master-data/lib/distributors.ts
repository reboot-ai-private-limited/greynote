import type {
  CreateDistributorDto,
  DistributorImpactDto,
  DistributorDto,
  UpdateDistributorDto,
} from '@greynote/contracts';
import { DISTRIBUTOR_DOCUMENT_TYPES, type DistributorDocumentType } from '@greynote/contracts';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { placeErrors } from './chemists';
import { fileError } from '@/features/people/lib/documents';
import { hasCoverage, sameIds } from './coverage';
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

export const DISTRIBUTOR_DOCUMENT_LABEL: Record<DistributorDocumentType, string> = {
  DRUG_LICENCE: 'Drug licence',
  GST_CERTIFICATE: 'GST certificate',
  PAN: 'PAN',
  AGREEMENT: 'Agreement',
  CANCELLED_CHEQUE: 'Cancelled cheque',
  OTHER: 'Other',
};
export const DISTRIBUTOR_DOCUMENT_OPTIONS = DISTRIBUTOR_DOCUMENT_TYPES.map((value) => ({ value, label: DISTRIBUTOR_DOCUMENT_LABEL[value] }));

export interface PendingDocument {
  /** Only to tell two files of one type apart in the list. */
  key: string;
  type: DistributorDocumentType;
  file: File;
}

/** What is wrong with a file about to be attached: its type and its size / extension. */
export function distributorDocumentErrors(draft: { type: string; file: { name: string; size: number } | null }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!(DISTRIBUTOR_DOCUMENT_TYPES as readonly string[]).includes(draft.type)) errors['documentType'] = 'Choose a document type.';
  if (!draft.file) errors['file'] = 'Choose a file.';
  else {
    const problem = fileError(draft.file);
    if (problem) errors['file'] = problem;
  }
  return errors;
}

export interface DistributorDraft {
  name: string;
  address: string;
  coordinates: CoordinateInputs;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  /** What it covers, as stored: each Zone, HQ and Route stands for everything under it (see `coverage.ts`). */
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
  assignedUserIds: string[];
  /** Files chosen while adding, uploaded once the distributor exists. The edit page uploads at once and never uses this. */
  pendingDocuments: PendingDocument[];
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
  zoneIds: [],
  hqIds: [],
  routeIds: [],
  assignedUserIds: [],
  pendingDocuments: [],
  openingDues: '',
};

export function distributorToDraft(d: DistributorDto): DistributorDraft {
  return {
    name: d.name,
    address: d.address,
    coordinates: pointToInputs(d.location),
    gstNumber: d.gstNumber,
    contactPerson: d.contactPerson,
    mobile: d.mobile,
    zoneIds: d.zoneIds,
    hqIds: d.hqIds,
    routeIds: d.routeIds,
    assignedUserIds: d.assignedUserIds,
    pendingDocuments: [],
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
  // The shared place rules check the name, the address and the point; the coverage rule is this form's own.
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
    coverage: hasCoverage(draft) ? undefined : 'Choose at least one zone, HQ or route.',
  };
}

/** Adding a distributor is five steps: who it is, where it works and who looks after it, where it sits on the map, its documents, and a look over it before it is created. */
export const DISTRIBUTOR_STEPS = ['details', 'coverage', 'location', 'documents', 'review'] as const;
export type DistributorStep = (typeof DISTRIBUTOR_STEPS)[number];
export const DISTRIBUTOR_STEP_LABEL: Record<DistributorStep, string> = {
  details: 'Details',
  coverage: 'Coverage',
  location: 'Location',
  documents: 'Documents',
  review: 'Review',
};

const STEP_FIELDS: Record<DistributorStep, readonly string[] | null> = {
  details: ['name', 'gstNumber', 'contactPerson', 'mobile', 'address', 'openingDues'],
  coverage: ['coverage'],
  location: ['latitude', 'longitude'],
  documents: [],
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
      zoneIds: draft.zoneIds,
      hqIds: draft.hqIds,
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

/** Only what changed. The zones, HQs, routes and people are each sent as the whole new list. */
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
      ...(!sameIds(draft.zoneIds, original.zoneIds) && { zoneIds: draft.zoneIds }),
      ...(!sameIds(draft.hqIds, original.hqIds) && { hqIds: draft.hqIds }),
      ...(!sameIds(draft.routeIds, original.routeIds) && { routeIds: draft.routeIds }),
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

const times = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * What the delete dialog lists. Everything here goes with the distributor, so there is no "kept" section: `erased` is the history,
 * `open` the part of it that was still live, and `note` the effect on reports. Empty lines are left out.
 */
export function distributorImpactLines(impact: DistributorImpactDto): { erased: string[]; open: string[]; note: string } {
  const erased = [
    impact.payments > 0 ? `${times(impact.payments, 'payment')} recorded against it` : '',
    impact.orders > 0 ? `${times(impact.orders, 'order')}` : '',
    impact.monthlyStock > 0 ? `${times(impact.monthlyStock, 'monthly stock count')}` : '',
    impact.stockStatements > 0 ? `${times(impact.stockStatements, 'stock statement line')}` : '',
    impact.documents > 0 ? `${times(impact.documents, 'uploaded document')}, deleted from storage` : '',
    impact.assignedPeople > 0 ? `Its link to ${times(impact.assignedPeople, 'assigned person')}` : '',
  ].filter(Boolean);
  const open = impact.openOrders > 0 ? [`${times(impact.openOrders, 'order')} still open (placed, not delivered) will be erased too`] : [];
  const hasHistory = impact.payments + impact.orders + impact.monthlyStock + impact.stockStatements > 0;
  return {
    erased,
    open,
    note: hasHistory ? 'Reports, dues and sales totals that include this distributor will change. This cannot be undone.' : 'This cannot be undone.',
  };
}
