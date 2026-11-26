/**
 * Where an employee works (decision-log 2026-11-26): every designation, MR to NSM, is based in exactly one HQ. Routes are not ticked per
 * person: an employee plans the routes of their HQ, and a manager also those of the HQs of the people below them. Zones are not stored;
 * the HQ brings its Zone. Pure, so it is tested without a browser.
 */
export interface TerritoryRule {
  /** One HQ, required, for everyone. */
  hqs: 'one';
  hqsRequired: true;
  routes: 'none';
}

const ONE_HQ: TerritoryRule = { hqs: 'one', hqsRequired: true, routes: 'none' };

/** The same for every designation now; the argument stays so callers need not change when a designation differs again. */
export const territoryRule = (_designation?: string | undefined): TerritoryRule => ONE_HQ;

export interface Selection {
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
}

/** What is missing, by field: exactly one HQ. */
export function territoryErrors(_rule: TerritoryRule, sel: Pick<Selection, 'hqIds'>, _hqs?: unknown): Record<string, string> {
  return sel.hqIds.length === 1 ? {} : { hqIds: 'Choose the HQ this employee is based in.' };
}

interface HqLike {
  id: string;
  zoneId: string;
}

/** Zone ids of the HQs (an HQ brings its Zone; the API reads it the same way). */
export const zonesOfHqs = (hqIds: readonly string[], hqs: readonly HqLike[]): string[] => [
  ...new Set(hqIds.flatMap((id) => hqs.filter((h) => h.id === id).map((h) => h.zoneId))),
];
