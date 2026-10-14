/** Pure planning for `migrate-route-km.ts`: Routes from the map version become "<HQ> to <destination>" + a typed km. */

export interface OldRoute {
  _id: unknown;
  hqId: unknown;
  name: string;
  destination?: { label?: string } | undefined;
  destinationName?: string | undefined;
  distanceKm?: unknown;
}
export interface HqRow {
  _id: unknown;
  name: string;
}

export interface RouteChange {
  id: unknown;
  $set: { destinationName: string; name: string; nameKey: string };
  $unset: Record<string, ''>;
}

export const OLD_ROUTE_FIELDS = ['destination', 'distanceSource', 'distanceStatus', 'distanceCalculatedAt', 'revision'] as const;

/** "Naxalbari, West Bengal, India" → "Naxalbari": the first part of a Google label. */
const firstPart = (label: string) => label.split(',')[0]!.trim();

export function planRouteKm(input: { routes: OldRoute[]; hqs: HqRow[] }): {
  changes: RouteChange[];
  /** Routes that had no distance — someone has to type the km. */
  noKm: Array<{ id: unknown; name: string }>;
  /** Routes whose destination name had to fall back to the old route name (two routes of one HQ shared a destination). */
  renamed: Array<{ id: unknown; from: string; to: string }>;
  problems: string[];
} {
  const hqName = new Map(input.hqs.map((h) => [String(h._id), h.name]));
  const taken = new Set<string>();
  const changes: RouteChange[] = [];
  const noKm: Array<{ id: unknown; name: string }> = [];
  const renamed: Array<{ id: unknown; from: string; to: string }> = [];
  const problems: string[] = [];

  // Routes already converted keep their names, so a new one can't take the same.
  for (const r of input.routes) if (r.destinationName) taken.add(`${String(r.hqId)}|${r.name.toLowerCase()}`);

  for (const r of input.routes) {
    if (r.destinationName) continue;
    const hq = hqName.get(String(r.hqId));
    if (!hq) {
      problems.push(`Route "${r.name}" (${String(r._id)}) has no HQ.`);
      continue;
    }
    if (r.distanceKm === null || r.distanceKm === undefined) noKm.push({ id: r._id, name: r.name });

    const candidates = [firstPart(r.destination?.label ?? ''), r.name].filter((c) => c.length > 0);
    let chosen: string | undefined;
    let suffix = 1;
    for (const c of candidates) {
      if (!taken.has(`${String(r.hqId)}|${`${hq} to ${c}`.toLowerCase()}`)) {
        chosen = c;
        break;
      }
    }
    while (chosen === undefined) {
      suffix += 1;
      const c = `${r.name} (${suffix})`;
      if (!taken.has(`${String(r.hqId)}|${`${hq} to ${c}`.toLowerCase()}`)) chosen = c;
    }
    const name = `${hq} to ${chosen}`;
    taken.add(`${String(r.hqId)}|${name.toLowerCase()}`);
    if (chosen !== candidates[0]) renamed.push({ id: r._id, from: candidates[0] ?? r.name, to: chosen });
    changes.push({
      id: r._id,
      $set: { destinationName: chosen, name, nameKey: name.toLowerCase() },
      $unset: Object.fromEntries(OLD_ROUTE_FIELDS.map((f) => [f, ''])) as Record<string, ''>,
    });
  }
  return { changes, noKm, renamed, problems };
}
