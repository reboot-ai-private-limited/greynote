import type { CreateDistributorDto, DistributorDto, UpdateDistributorDto } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { placeErrors, type PlaceDraft } from './chemists';
import { EMPTY_COORDINATES, locationChange, pointFromInputs, pointToInputs } from './location';

/** The 15-character GST number: 2 digits (state), 5 letters, 4 digits, a letter, a letter or digit, `Z`, a letter or digit. */
export const GST = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const MOBILE = /^\+?\d{10,15}$/;
export const CONTACT_MAX = 150;

/** `''` is "not chosen yet": whether a Distributor may take primary or secondary orders is Admin's call, so there is no default. */
export type SalesChoice = '' | 'yes' | 'no';

export interface DistributorDraft extends PlaceDraft {
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  assignedMrId: string;
  assignedAsmId: string;
  primarySales: SalesChoice;
  secondarySales: SalesChoice;
}

export const EMPTY_DISTRIBUTOR: DistributorDraft = {
  routeId: '',
  name: '',
  address: '',
  coordinates: { ...EMPTY_COORDINATES },
  gstNumber: '',
  contactPerson: '',
  mobile: '',
  assignedMrId: '',
  assignedAsmId: '',
  primarySales: '',
  secondarySales: '',
};

export function distributorToDraft(d: DistributorDto): DistributorDraft {
  return {
    routeId: d.routeId,
    name: d.name,
    address: d.address,
    coordinates: pointToInputs(d.location),
    gstNumber: d.gstNumber,
    contactPerson: d.contactPerson,
    mobile: d.mobile,
    assignedMrId: d.assignedMrId ?? '',
    assignedAsmId: d.assignedAsmId ?? '',
    primarySales: d.primarySalesEnabled ? 'yes' : 'no',
    secondarySales: d.secondarySalesEnabled ? 'yes' : 'no',
  };
}

export const normalizeGst = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();
/** Spaces and dashes are how people type a number; the API wants digits and an optional leading plus. */
export const normalizeMobile = (raw: string) => raw.replace(/[\s-]/g, '');

function errorsFor(draft: DistributorDraft): Record<string, string | undefined> {
  const gst = normalizeGst(draft.gstNumber);
  const mobile = normalizeMobile(draft.mobile);
  const contact = squash(draft.contactPerson);
  return {
    ...placeErrors(draft, 'distributor name'),
    gstNumber: gst === '' ? 'Enter the GST number.' : GST.test(gst) ? undefined : 'A GST number is 15 characters, e.g. 19ABCDE1234F1Z5.',
    contactPerson: contact === '' ? 'Enter a contact person.' : contact.length > CONTACT_MAX ? `Keep it to ${CONTACT_MAX} characters.` : undefined,
    mobile: mobile === '' ? 'Enter a mobile number.' : MOBILE.test(mobile) ? undefined : 'Use 10 to 15 digits, with an optional leading +.',
    primarySales: draft.primarySales === '' ? 'Choose yes or no.' : undefined,
    secondarySales: draft.secondarySales === '' ? 'Choose yes or no.' : undefined,
    ...(draft.assignedMrId !== '' && draft.assignedMrId === draft.assignedAsmId ? { assignedAsmId: 'The MR and the ASM must be different people.' } : {}),
  };
}

export function buildDistributor(draft: DistributorDraft): BuildResult<CreateDistributorDto> {
  const errors = errorsFor(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  return {
    ok: true,
    body: {
      routeId: draft.routeId,
      name: squash(draft.name),
      gstNumber: normalizeGst(draft.gstNumber),
      contactPerson: squash(draft.contactPerson),
      mobile: normalizeMobile(draft.mobile),
      address: squash(draft.address),
      location: point.point,
      assignedMrId: draft.assignedMrId || null,
      assignedAsmId: draft.assignedAsmId || null,
      primarySalesEnabled: draft.primarySales === 'yes',
      secondarySalesEnabled: draft.secondarySales === 'yes',
    },
  };
}

/** Only what changed. Emptying the MR or the ASM is sent as `null`, which the API reads as "un-assign". */
export function buildDistributorUpdate(original: DistributorDto, draft: DistributorDraft): BuildResult<UpdateDistributorDto> {
  const errors = errorsFor(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  const name = squash(draft.name);
  const address = squash(draft.address);
  const contactPerson = squash(draft.contactPerson);
  const gstNumber = normalizeGst(draft.gstNumber);
  const mobile = normalizeMobile(draft.mobile);
  const primary = draft.primarySales === 'yes';
  const secondary = draft.secondarySales === 'yes';
  return {
    ok: true,
    body: {
      ...(draft.routeId !== original.routeId && { routeId: draft.routeId }),
      ...(name !== original.name && { name }),
      ...(address !== original.address && { address }),
      ...(gstNumber !== original.gstNumber && { gstNumber }),
      ...(contactPerson !== original.contactPerson && { contactPerson }),
      ...(mobile !== original.mobile && { mobile }),
      ...locationChange(original.location, point.point),
      ...(draft.assignedMrId !== (original.assignedMrId ?? '') && { assignedMrId: draft.assignedMrId || null }),
      ...(draft.assignedAsmId !== (original.assignedAsmId ?? '') && { assignedAsmId: draft.assignedAsmId || null }),
      ...(primary !== original.primarySalesEnabled && { primarySalesEnabled: primary }),
      ...(secondary !== original.secondarySalesEnabled && { secondarySalesEnabled: secondary }),
    },
  };
}

export const SALES_OPTIONS = [
  { value: 'yes', label: 'Allowed' },
  { value: 'no', label: 'Not allowed' },
];
