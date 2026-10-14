import type { CreateHqDto, CreateZoneDto, HqDto, RouteType, UpdateHqDto, UpdateZoneDto, ZoneDto } from '@greynote/contracts';

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

export function nameError(name: string): string | undefined {
  if (name === '') return 'Enter a name.';
  if (name.length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters.`;
  return undefined;
}

export function fail(errors: Record<string, string | undefined>): { ok: false; errors: Record<string, string> } {
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
  if (errors.zoneId || errors.name) return fail(errors);
  return { ok: true, body: { zoneId: draft.zoneId, name } };
}

/**
 * The fields of an edit that actually changed. The API rejects an empty update, and sending only
 * what changed keeps a rename from also re-sending (and racing on) the status.
 */
export function changedZoneFields(original: ZoneDto, draft: { name: string }): UpdateZoneDto {
  const name = normalizeName(draft.name);
  return name !== original.name ? { name } : {};
}

/** An HQ edit's changed fields: just the name (renaming an HQ re-names its routes). */
export function changedHqFields(original: HqDto, draft: { name: string }): UpdateHqDto {
  const name = normalizeName(draft.name);
  return name !== original.name ? { name } : {};
}

/** The type select's "follow the km" choice. */
export const AUTO_ROUTE_TYPE = 'AUTO';
/** The Automatic option's label, naming what it gives for the km typed so far. */
export function autoTypeLabel(suggested: RouteType | null): string {
  return suggested ? `Automatic — ${ROUTE_TYPE_LABEL[suggested]}` : 'Automatic (from the km)';
}

export const ROUTE_TYPE_LABEL: Record<RouteType, string> = {
  HQ: 'HQ',
  EX_STATION: 'Ex-station',
  OUT_STATION: 'Out-station',
};
