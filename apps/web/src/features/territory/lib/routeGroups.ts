/** Routes laid out Zone > HQ > Route for the tick lists, with the tick arithmetic for "all of a Zone" and "all of an HQ". Pure, so it is tested without a browser. */
interface RouteLike {
  id: string;
  hqId: string;
  name: string;
}
interface HqLike {
  id: string;
  name: string;
  zoneId: string;
}
interface ZoneLike {
  id: string;
  name: string;
}

export interface HqGroup<R> {
  id: string;
  name: string;
  routes: R[];
}
export interface ZoneGroup<R> {
  id: string;
  name: string;
  hqs: HqGroup<R>[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Zones and HQs with no route to show are left out; a route whose HQ is unknown is left out too (it cannot be placed). */
export function groupRoutes<R extends RouteLike>(
  routes: readonly R[],
  hqs: readonly HqLike[],
  zones: readonly ZoneLike[],
): ZoneGroup<R>[] {
  const out: ZoneGroup<R>[] = [];
  for (const zone of [...zones].sort(byName)) {
    const groups: HqGroup<R>[] = [];
    for (const hq of hqs.filter((h) => h.zoneId === zone.id).sort(byName)) {
      const mine = routes.filter((r) => r.hqId === hq.id).sort(byName);
      if (mine.length > 0) groups.push({ id: hq.id, name: hq.name, routes: mine });
    }
    if (groups.length > 0) out.push({ id: zone.id, name: zone.name, hqs: groups });
  }
  return out;
}

export type Tick = 'all' | 'some' | 'none';

export function tickState(ids: readonly string[], selected: readonly string[]): Tick {
  const on = ids.filter((id) => selected.includes(id)).length;
  return on === 0 ? 'none' : on === ids.length ? 'all' : 'some';
}

/** Ticks (or unticks) every id in `ids`, leaving the rest of the selection as it was. */
export function setTicked(selected: readonly string[], ids: readonly string[], on: boolean): string[] {
  const set = new Set(ids);
  return on ? [...new Set([...selected, ...ids])] : selected.filter((id) => !set.has(id));
}

/** What saving a ticked list does to what is stored: the routes to add and the ones to take off. */
export function diffRoutes(before: readonly string[], after: readonly string[]): { add: string[]; remove: string[] } {
  return { add: after.filter((id) => !before.includes(id)), remove: before.filter((id) => !after.includes(id)) };
}
