import { AREA_TYPES, type AreaDto, type AreaType, type CreateAreaDto, type CreateHqDto, type CreateZoneDto, type UpdateAreaDto, type UpdateZoneDto, type HqDto, type ZoneDto } from '@greynote/contracts';

/**
 * Form drafts → request bodies. Forms hold strings; these turn them into what the API accepts, or
 * say what is wrong per field. Pure, so the rules are tested without a browser.
 */
export type BuildResult<T> = { ok: true; body: T } | { ok: false; errors: Record<string, string> };

export const NAME_MAX = 100;

/** Trim and collapse inner whitespace, as the server does — "Siliguri  HQ" must equal "Siliguri HQ". */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function nameError(name: string): string | undefined {
  if (name === '') return 'Enter a name.';
  if (name.length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters.`;
  return undefined;
}

function fail(errors: Record<string, string | undefined>): { ok: false; errors: Record<string, string> } {
  return { ok: false, errors: Object.fromEntries(Object.entries(errors).filter((e): e is [string, string] => e[1] !== undefined)) };
}

export function buildZone(draft: { name: string }): BuildResult<CreateZoneDto> {
  const name = normalizeName(draft.name);
  const error = nameError(name);
  return error ? fail({ name: error }) : { ok: true, body: { name } };
}

export function buildHq(draft: { zoneId: string; name: string }): BuildResult<CreateHqDto> {
  const name = normalizeName(draft.name);
  const errors = { zoneId: draft.zoneId ? undefined : 'Choose a zone.', name: nameError(name) };
  return errors.zoneId || errors.name ? fail(errors) : { ok: true, body: { zoneId: draft.zoneId, name } };
}

export function buildArea(draft: { hqId: string; name: string; type: string }): BuildResult<CreateAreaDto> {
  const name = normalizeName(draft.name);
  const isType = (value: string): value is AreaType => (AREA_TYPES as readonly string[]).includes(value);
  const errors = {
    hqId: draft.hqId ? undefined : 'Choose an HQ.',
    name: nameError(name),
    type: isType(draft.type) ? undefined : 'Choose a type.',
  };
  if (errors.hqId || errors.name || errors.type || !isType(draft.type)) return fail(errors);
  return { ok: true, body: { hqId: draft.hqId, name, type: draft.type } };
}

/**
 * The fields of an edit that actually changed. The API rejects an empty update, and sending only
 * what changed keeps a rename from also re-sending (and racing on) the status.
 */
export function changedZoneFields(original: ZoneDto | HqDto, draft: { name: string }): UpdateZoneDto {
  const name = normalizeName(draft.name);
  return name !== original.name ? { name } : {};
}

export function changedAreaFields(original: AreaDto, draft: { name: string; type: AreaType }): UpdateAreaDto {
  const name = normalizeName(draft.name);
  return {
    ...(name !== original.name && { name }),
    ...(draft.type !== original.type && { type: draft.type }),
  };
}

export const AREA_TYPE_LABEL: Record<AreaType, string> = {
  HQ: 'HQ',
  EX_STATION: 'Ex-station',
  OUT_STATION: 'Out-station',
};
