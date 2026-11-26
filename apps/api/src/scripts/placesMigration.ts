/**
 * Pure planning for `migrate-places.ts` (decision-log 2026-11-26): every HQ gets its town place, every route
 * "<HQ> to <destination>" becomes HQ town ↔ a place named after the destination (with the route's type).
 *
 * - A route whose destination is the HQ itself ("SILIGURI to SILIGURI", work inside the town) becomes town ↔ town:
 *   kept, because old plans and doctors point at it; new ones can't be made.
 * - One place per destination per HQ, ignoring case. Its status is active if any of its routes is active.
 * - Already-migrated routes (they have a `fromPlaceId`) and existing places are left alone, so it is safe to repeat.
 */

export interface MigHq {
  _id: unknown;
  name: string;
  status: string;
}
export interface MigPlace {
  _id: unknown;
  hqId: unknown;
  nameKey: string;
  isHqTown?: boolean | undefined;
}
export interface MigRoute {
  _id: unknown;
  hqId: unknown;
  name: string;
  destinationName: string;
  type: string;
  status: string;
  fromPlaceId?: unknown;
}

export interface NewPlace {
  _id: string;
  hqId: string;
  name: string;
  nameKey: string;
  type: string;
  isHqTown: boolean;
  status: 'active' | 'inactive';
}
export interface RouteEnds {
  id: unknown;
  fromPlaceId: string;
  toPlaceId: string;
  pairKey: string;
}

const pairKeyOf = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function planPlaces(input: { hqs: MigHq[]; places: MigPlace[]; routes: MigRoute[]; newId: () => string }): {
  places: NewPlace[];
  routes: RouteEnds[];
  selfRoutes: string[];
  problems: string[];
} {
  const problems: string[] = [];
  const hqById = new Map(input.hqs.map((h) => [String(h._id), h]));
  /** `${hqId}|${nameKey}` → place id (existing or new). */
  const placeByKey = new Map<string, string>();
  const townOf = new Map<string, string>();
  for (const p of input.places) {
    placeByKey.set(`${String(p.hqId)}|${p.nameKey}`, String(p._id));
    if (p.isHqTown) townOf.set(String(p.hqId), String(p._id));
  }

  const created = new Map<string, NewPlace>();
  const add = (place: Omit<NewPlace, '_id'>): string => {
    const id = input.newId();
    created.set(id, { ...place, _id: id });
    placeByKey.set(`${place.hqId}|${place.nameKey}`, id);
    return id;
  };

  for (const hq of input.hqs) {
    const hqId = String(hq._id);
    if (townOf.has(hqId)) continue;
    const key = `${hqId}|${hq.name.toLowerCase()}`;
    if (placeByKey.has(key)) {
      problems.push(`HQ "${hq.name}" has a place with its name that is not its town.`);
      continue;
    }
    townOf.set(hqId, add({ hqId, name: hq.name, nameKey: hq.name.toLowerCase(), type: 'HQ', isHqTown: true, status: hq.status === 'inactive' ? 'inactive' : 'active' }));
  }

  const routes: RouteEnds[] = [];
  const selfRoutes: string[] = [];
  for (const r of input.routes) {
    if (r.fromPlaceId) continue;
    const hqId = String(r.hqId);
    const hq = hqById.get(hqId);
    const town = townOf.get(hqId);
    if (!hq || !town) {
      problems.push(`Route "${r.name}" (${String(r._id)}) has no HQ.`);
      continue;
    }
    const key = `${hqId}|${r.destinationName.toLowerCase()}`;
    let to = placeByKey.get(key);
    if (!to) {
      to = add({ hqId, name: r.destinationName, nameKey: r.destinationName.toLowerCase(), type: r.type, isHqTown: false, status: r.status === 'active' ? 'active' : 'inactive' });
    } else if (r.status === 'active' && created.get(to)?.status === 'inactive') {
      created.get(to)!.status = 'active';
    }
    if (to === town) selfRoutes.push(r.name);
    routes.push({ id: r._id, fromPlaceId: town, toPlaceId: to, pairKey: pairKeyOf(town, to) });
  }

  const pairs = new Set<string>();
  for (const r of routes) {
    if (pairs.has(r.pairKey)) problems.push(`Two routes would join the same two places (route ${String(r.id)}).`);
    pairs.add(r.pairKey);
  }
  return { places: [...created.values()], routes, selfRoutes, problems };
}
