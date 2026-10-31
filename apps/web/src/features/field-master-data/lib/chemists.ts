import type { ChemistDto, ChemistStatus, CreateChemistDto, UpdateChemistDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { fail, squash, type BuildResult } from '@/lib/forms';
import {
  EMPTY_COORDINATES,
  locationChange,
  pointFromInputs,
  pointToInputs,
  type CoordinateInputs,
} from './location';

export const CHEMIST_STATUS_LABEL: Record<ChemistStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  pending: 'Awaiting approval',
};

export const CHEMIST_STATUS_TONE: Record<ChemistStatus, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  pending: 'warning',
};

/** Admin can move a Chemist between active and inactive; a pending one is the approval's to decide. */
export const canToggleChemistStatus = (status: ChemistStatus): boolean => status !== 'pending';

/** Where a pending chemist is approved: the NEW_CHEMIST queue. */
export const PENDING_CHEMIST_APPROVALS_HREF = '/approvals?kind=NEW_CHEMIST';

export const NAME_MAX = 150;
export const ADDRESS_MAX = 500;

/** The pieces every outlet-like record (Chemist, Distributor, Doctor) shares in its form. */
export interface PlaceDraft {
  routeId: string;
  name: string;
  address: string;
  coordinates: CoordinateInputs;
}

export const EMPTY_CHEMIST: PlaceDraft = {
  routeId: '',
  name: '',
  address: '',
  coordinates: { ...EMPTY_COORDINATES },
};

export function chemistToDraft(chemist: ChemistDto): PlaceDraft {
  return {
    routeId: chemist.routeId,
    name: chemist.name,
    address: chemist.address,
    coordinates: pointToInputs(chemist.location),
  };
}

/** Errors common to the three: the Route, the name and the address, plus the location's two fields. */
export function placeErrors(
  draft: PlaceDraft,
  nameLabel = 'name',
): Record<string, string | undefined> {
  const name = squash(draft.name);
  const address = squash(draft.address);
  const point = pointFromInputs(draft.coordinates);
  return {
    routeId: draft.routeId === '' ? 'Choose a route.' : undefined,
    name:
      name === ''
        ? `Enter the ${nameLabel}.`
        : name.length > NAME_MAX
          ? `Keep the ${nameLabel} to ${NAME_MAX} characters.`
          : undefined,
    address:
      address === ''
        ? 'Enter the address.'
        : address.length > ADDRESS_MAX
          ? `Keep the address to ${ADDRESS_MAX} characters.`
          : undefined,
    ...(point.ok ? {} : point.errors),
  };
}

export function buildChemist(draft: PlaceDraft): BuildResult<CreateChemistDto> {
  const errors = placeErrors(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  return {
    ok: true,
    body: {
      routeId: draft.routeId,
      name: squash(draft.name),
      address: squash(draft.address),
      location: point.point,
    },
  };
}

/** Only what changed; `{}` means nothing did. A cleared location is sent as `null`. */
export function buildChemistUpdate(
  original: ChemistDto,
  draft: PlaceDraft,
): BuildResult<UpdateChemistDto> {
  const errors = placeErrors(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  const name = squash(draft.name);
  const address = squash(draft.address);
  return {
    ok: true,
    body: {
      ...(draft.routeId !== original.routeId && { routeId: draft.routeId }),
      ...(name !== original.name && { name }),
      ...(address !== original.address && { address }),
      ...locationChange(original.location, point.point),
    },
  };
}

/** Adding a chemist is three steps: where it is and what it is called, where it sits on the map, and a look over it before it is created. */
export const CHEMIST_STEPS = ['details', 'location', 'review'] as const;
export type ChemistStep = (typeof CHEMIST_STEPS)[number];
export const CHEMIST_STEP_LABEL: Record<ChemistStep, string> = {
  details: 'Details',
  location: 'Location',
  review: 'Review',
};

const CHEMIST_DETAIL_FIELDS = ['routeId', 'name', 'address'];
const CHEMIST_LOCATION_FIELDS = ['latitude', 'longitude'];

/** What is wrong with the fields of one step (the review step checks everything), so "Next" can say so before moving on. */
export function chemistStepErrors(draft: PlaceDraft, step: ChemistStep): Record<string, string> {
  const all = placeErrors(draft);
  const fields =
    step === 'details'
      ? CHEMIST_DETAIL_FIELDS
      : step === 'location'
        ? CHEMIST_LOCATION_FIELDS
        : null;
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(all)) {
    if (message && (fields === null || fields.includes(field))) out[field] = message;
  }
  return out;
}
