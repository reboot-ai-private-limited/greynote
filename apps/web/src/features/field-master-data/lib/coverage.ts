/**
 * A distributor's coverage as the API stores it: each Zone, HQ and Route stands for everything under it, so a Zone alone is all its HQs
 * and an HQ alone is all its Routes. The picker works on ticks instead — a ticked Zone with nothing ticked below it is "all", ticking
 * an HQ narrows it — the same way employee coverage reads. These two convert between the views.
 */
export interface Coverage {
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
}

/** Where things sit, for walking up from a Route to its HQ and Zone. */
export interface Hierarchy {
  hqs: ReadonlyArray<{ id: string; zoneId: string }>;
  routes: ReadonlyArray<{ id: string; hqId: string }>;
}

const uniq = (ids: Iterable<string>) => [...new Set(ids)];

/** The ticks the picker shows for what is stored: the Zone and HQ above each stored HQ or Route are ticked too. */
export function toTicks(stored: Coverage, h: Hierarchy): Coverage {
  const zoneOfHq = new Map(h.hqs.map((q) => [q.id, q.zoneId]));
  const hqOfRoute = new Map(h.routes.map((r) => [r.id, r.hqId]));
  const hqIds = uniq([...stored.hqIds, ...stored.routeIds.flatMap((r) => hqOfRoute.get(r) ?? [])]);
  const zoneIds = uniq([...stored.zoneIds, ...hqIds.flatMap((q) => zoneOfHq.get(q) ?? [])]);
  return { zoneIds, hqIds, routeIds: [...stored.routeIds] };
}

/**
 * What to store for these ticks: a Zone with no HQ ticked in it is stored whole, an HQ with no Route ticked in it is stored whole, and
 * only the Routes ticked inside a narrowed HQ are stored one by one.
 */
export function toStored(ticks: Coverage, h: Hierarchy): Coverage {
  const zoneOfHq = new Map(h.hqs.map((q) => [q.id, q.zoneId]));
  const hqOfRoute = new Map(h.routes.map((r) => [r.id, r.hqId]));
  const tickedHqs = ticks.hqIds.filter((q) => ticks.zoneIds.includes(zoneOfHq.get(q) ?? ''));
  const tickedRoutes = ticks.routeIds.filter((r) => tickedHqs.includes(hqOfRoute.get(r) ?? ''));
  const zonesNarrowed = new Set(tickedHqs.map((q) => zoneOfHq.get(q)));
  const hqsNarrowed = new Set(tickedRoutes.map((r) => hqOfRoute.get(r)));
  return {
    zoneIds: ticks.zoneIds.filter((z) => !zonesNarrowed.has(z)),
    hqIds: tickedHqs.filter((q) => !hqsNarrowed.has(q)),
    routeIds: tickedRoutes,
  };
}

export const hasCoverage = (c: Coverage) => c.zoneIds.length + c.hqIds.length + c.routeIds.length > 0;

/** The HQs a coverage reaches: those stored, those of a stored Zone, and those of a stored Route. For narrowing a people list. */
export function hqsReached(stored: Coverage, h: Hierarchy): string[] {
  const hqOfRoute = new Map(h.routes.map((r) => [r.id, r.hqId]));
  return uniq([
    ...stored.hqIds,
    ...h.hqs.filter((q) => stored.zoneIds.includes(q.zoneId)).map((q) => q.id),
    ...stored.routeIds.flatMap((r) => hqOfRoute.get(r) ?? []),
  ]);
}

export const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);

/** One line on a Zone's card: what of it is covered, from the ticks (`toTicks`) rather than what is stored. */
export function zoneSummary(ticks: Coverage, zoneId: string, h: Hierarchy): string {
  const inZone = h.hqs.filter((q) => q.zoneId === zoneId).map((q) => q.id);
  const picked = ticks.hqIds.filter((q) => inZone.includes(q));
  if (picked.length === 0) return 'All HQs and routes';
  const routes = ticks.routeIds.filter((r) => picked.includes(h.routes.find((x) => x.id === r)?.hqId ?? '')).length;
  const hqs = `${picked.length} of ${inZone.length} HQ${inZone.length === 1 ? '' : 's'}`;
  return routes > 0 ? `${hqs}, ${routes} route${routes === 1 ? '' : 's'}` : `${hqs}, all routes`;
}
