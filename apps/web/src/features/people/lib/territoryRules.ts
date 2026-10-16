/**
 * What a designation edits in its territory (Zones, then HQs inside them, then routes inside those): the one general rule behind the employee
 * page's Territory card and the onboarding Work step. Everything may hold several values; the designation only decides which levels are
 * picked, which are required, and which are just ways to browse. Pure, so it is tested without a browser.
 *
 * - MR: Zone, then its HQs (required) and routes (required). The Zones ticked only list the HQs; the Zones kept are those of the HQs chosen.
 * - ASM and RSM: Zone, then HQs (required) and routes (optional).
 * - ZSM: Zones (required), HQs optional: none ticked means every HQ of the Zones.
 * - NSM: Zones, optional: none ticked means every Zone. No HQs, no routes.
 */
export interface TerritoryRule {
  zones: 'pick' | 'browse';
  zonesRequired: boolean;
  hqs: 'pick' | 'narrow' | 'none';
  hqsRequired: boolean;
  routes: 'required' | 'optional' | 'none';
}

const NONE: TerritoryRule = {
  zones: 'browse',
  zonesRequired: false,
  hqs: 'none',
  hqsRequired: false,
  routes: 'none',
};

const RULES: Record<string, TerritoryRule> = {
  MR: { zones: 'pick', zonesRequired: false, hqs: 'pick', hqsRequired: true, routes: 'required' },
  ASM: {
    zones: 'pick',
    zonesRequired: false,
    hqs: 'pick',
    hqsRequired: true,
    routes: 'optional',
  },
  RSM: {
    zones: 'pick',
    zonesRequired: false,
    hqs: 'pick',
    hqsRequired: true,
    routes: 'optional',
  },
  ZSM: { zones: 'pick', zonesRequired: true, hqs: 'narrow', hqsRequired: false, routes: 'none' },
  NSM: { zones: 'pick', zonesRequired: false, hqs: 'none', hqsRequired: false, routes: 'none' },
};

export const territoryRule = (designation: string | undefined): TerritoryRule =>
  designation ? (RULES[designation] ?? NONE) : NONE;

export interface Selection {
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
}

interface HqLike {
  id: string;
  zoneId: string;
  status?: string;
}
interface RouteLike {
  id: string;
  hqId: string;
}

/** Ticked Zones with no HQ ticked under them: for a designation that names HQs such a Zone would be lost on saving. */
export function zonesWithoutHqs(
  rule: TerritoryRule,
  sel: Selection,
  hqs: readonly HqLike[],
): string[] {
  if (!rule.hqsRequired) return [];
  const withHq = new Set(sel.hqIds.map((id) => hqs.find((h) => h.id === id)?.zoneId));
  return sel.zoneIds.filter((z) => !withHq.has(z));
}

/** What is missing, by field. `hqs` (every HQ) lets it also catch a ticked Zone left with no HQ. */
export function territoryErrors(
  rule: TerritoryRule,
  sel: Selection,
  hqs?: readonly HqLike[],
): Record<string, string> {
  const e: Record<string, string> = {};
  if (rule.zonesRequired && sel.zoneIds.length === 0) e['zoneIds'] = 'Choose at least one zone.';
  if (rule.hqsRequired && sel.hqIds.length === 0) e['hqIds'] = 'Choose at least one HQ.';
  else if (hqs && zonesWithoutHqs(rule, sel, hqs).length > 0)
    e['hqIds'] = 'Tick an HQ under every ticked zone, or untick the zone.';
  if (rule.routes === 'required' && sel.routeIds.length === 0)
    e['routeIds'] = 'Choose at least one route.';
  return e;
}

/**
 * After the zones change: HQs of a zone no longer ticked go, and so do their routes; where the designation picks HQs, every active HQ of a newly
 * ticked zone is ticked by default (untick any not wanted) and so its routes. `before` is the selection before the change.
 */
export function afterZonesChange(
  rule: TerritoryRule,
  sel: Selection,
  before: { zoneIds: readonly string[]; hqIds: readonly string[] },
  hqs: readonly HqLike[],
  routes: readonly RouteLike[],
): Selection {
  if (rule.zones !== 'pick') return sel;
  const zone = new Set(sel.zoneIds);
  const kept = sel.hqIds.filter((id) => zone.has(hqs.find((h) => h.id === id)?.zoneId ?? ''));
  const wasZone = new Set(before.zoneIds);
  const added =
    rule.hqs === 'pick'
      ? hqs
          .filter(
            (h) =>
              zone.has(h.zoneId) && !wasZone.has(h.zoneId) && (h.status ?? 'active') === 'active',
          )
          .map((h) => h.id)
      : [];
  const hqIds = [...new Set([...kept, ...added])];
  return afterHqsChange({ ...sel, hqIds }, before.hqIds, routes, rule);
}

/**
 * After the HQs change: routes of an HQ no longer ticked go, and — where the designation holds routes — every route of a newly ticked HQ is
 * ticked by default (untick any not wanted). `before` is the HQ list before the change.
 */
export function afterHqsChange(
  sel: Selection,
  before: readonly string[],
  routes: readonly RouteLike[],
  rule: TerritoryRule,
): Selection {
  const now = new Set(sel.hqIds);
  const kept = sel.routeIds.filter((id) => now.has(routes.find((r) => r.id === id)?.hqId ?? ''));
  if (rule.routes === 'none') return { ...sel, routeIds: [] };
  const was = new Set(before);
  const added = routes.filter((r) => now.has(r.hqId) && !was.has(r.hqId)).map((r) => r.id);
  return { ...sel, routeIds: [...new Set([...kept, ...added])] };
}

/** Zone ids of the HQs (a ticked HQ always brings its Zone along for holidays and the flag; the API reads it the same way). */
export const zonesOfHqs = (hqIds: readonly string[], hqs: readonly HqLike[]): string[] => [
  ...new Set(hqIds.flatMap((id) => hqs.filter((h) => h.id === id).map((h) => h.zoneId))),
];
