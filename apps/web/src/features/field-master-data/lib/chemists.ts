import type { ChemistDto, CreateChemistDto, UpdateChemistDto } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { EMPTY_COORDINATES, locationChange, pointFromInputs, pointToInputs, type CoordinateInputs } from './location';

export const NAME_MAX = 150;
export const ADDRESS_MAX = 500;

/** The pieces every outlet-like record (Chemist, Distributor, Doctor) shares in its form. */
export interface PlaceDraft {
  routeId: string;
  name: string;
  address: string;
  coordinates: CoordinateInputs;
}

export const EMPTY_CHEMIST: PlaceDraft = { routeId: '', name: '', address: '', coordinates: { ...EMPTY_COORDINATES } };

export function chemistToDraft(chemist: ChemistDto): PlaceDraft {
  return { routeId: chemist.routeId, name: chemist.name, address: chemist.address, coordinates: pointToInputs(chemist.location) };
}

/** Errors common to the three: the Route, the name and the address, plus the location's two fields. */
export function placeErrors(draft: PlaceDraft, nameLabel = 'name'): Record<string, string | undefined> {
  const name = squash(draft.name);
  const address = squash(draft.address);
  const point = pointFromInputs(draft.coordinates);
  return {
    routeId: draft.routeId === '' ? 'Choose a route.' : undefined,
    name: name === '' ? `Enter the ${nameLabel}.` : name.length > NAME_MAX ? `Keep the ${nameLabel} to ${NAME_MAX} characters.` : undefined,
    address: address === '' ? 'Enter the address.' : address.length > ADDRESS_MAX ? `Keep the address to ${ADDRESS_MAX} characters.` : undefined,
    ...(point.ok ? {} : point.errors),
  };
}

export function buildChemist(draft: PlaceDraft): BuildResult<CreateChemistDto> {
  const errors = placeErrors(draft);
  const point = pointFromInputs(draft.coordinates);
  if (Object.values(errors).some(Boolean) || !point.ok) return fail(errors);
  return {
    ok: true,
    body: { routeId: draft.routeId, name: squash(draft.name), address: squash(draft.address), location: point.point },
  };
}

/** Only what changed; `{}` means nothing did. A cleared location is sent as `null`. */
export function buildChemistUpdate(original: ChemistDto, draft: PlaceDraft): BuildResult<UpdateChemistDto> {
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
