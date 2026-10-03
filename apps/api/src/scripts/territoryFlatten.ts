/**
 * The pure part of the Area-removal migration (decision-log 2026-10-03), kept apart from the
 * Mongo script so it can be tested: given the old `areas` and `routes` documents, what to write.
 */

interface PlaceDoc {
  label: string;
  latitude: number;
  longitude: number;
  placeId: string;
}
export interface OldArea {
  _id: unknown;
  hqId: unknown;
  type: string;
}
export interface OldRoute {
  _id: unknown;
  name?: string;
  nameKey?: string;
  areaId?: unknown;
  hqId?: unknown;
  waypoints?: PlaceDoc[];
}
export interface HqDoc {
  _id: unknown;
  name?: string;
  basePlace?: PlaceDoc | null;
}

export interface RouteChange {
  id: unknown;
  $set: { hqId: unknown; type: string; destination: PlaceDoc };
  $unset: { areaId: ''; waypoints: '' };
}
export interface BasePlaceSuggestion {
  hqId: unknown;
  hqName: string | undefined;
  /** The first waypoint of the HQ's first Route: where its routes used to start. */
  suggested: PlaceDoc;
}

const place = ({ label, latitude, longitude, placeId }: PlaceDoc): PlaceDoc => ({ label, latitude, longitude, placeId });

/**
 * Route → `hqId` from its Area's HQ, `type` from its Area's type, `destination` = its last
 * waypoint; `areaId` and `waypoints` go. A Route already converted (it has an `hqId` and no
 * `areaId`) is skipped, so the run is repeatable. Anything that can't be converted exactly is
 * a problem, and the caller writes nothing while there are problems.
 *
 * Route names were unique per Area; they must now be unique per HQ, so two Routes whose Areas
 * share an HQ and whose names match (ignoring case) are reported instead of silently colliding.
 */
export function planTerritoryFlatten(input: { areas: OldArea[]; routes: OldRoute[]; hqs: HqDoc[] }): {
  changes: RouteChange[];
  problems: string[];
  basePlaceSuggestions: BasePlaceSuggestion[];
} {
  const areaById = new Map(input.areas.map((a) => [String(a._id), a]));
  const changes: RouteChange[] = [];
  const problems: string[] = [];
  const nameOwners = new Map<string, string>();
  const firstWaypointByHq = new Map<string, PlaceDoc>();

  const sorted = [...input.routes].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  for (const route of sorted) {
    const label = `Route ${route.name ?? '?'} (${String(route._id)})`;
    if (route.areaId === undefined || route.areaId === null) {
      if (route.hqId !== undefined && route.hqId !== null) nameOwners.set(`${String(route.hqId)}/${(route.nameKey ?? route.name ?? '').toLowerCase()}`, label);
      continue;
    }
    const area = areaById.get(String(route.areaId));
    if (!area) {
      problems.push(`${label}: its Area ${String(route.areaId)} no longer exists`);
      continue;
    }
    const waypoints = route.waypoints ?? [];
    const last = waypoints.at(-1);
    const first = waypoints[0];
    if (!last || !first) {
      problems.push(`${label}: it has no waypoints, so there is no destination to keep`);
      continue;
    }
    const nameKey = `${String(area.hqId)}/${(route.nameKey ?? route.name ?? '').toLowerCase()}`;
    const clash = nameOwners.get(nameKey);
    if (clash) problems.push(`${label} and ${clash}: same name under the same HQ — rename one before migrating`);
    else nameOwners.set(nameKey, label);

    if (!firstWaypointByHq.has(String(area.hqId))) firstWaypointByHq.set(String(area.hqId), place(first));
    changes.push({
      id: route._id,
      $set: { hqId: area.hqId, type: area.type, destination: place(last) },
      $unset: { areaId: '', waypoints: '' },
    });
  }

  const basePlaceSuggestions = input.hqs
    .filter((hq) => !hq.basePlace && firstWaypointByHq.has(String(hq._id)))
    .map((hq) => ({ hqId: hq._id, hqName: hq.name, suggested: firstWaypointByHq.get(String(hq._id)) as PlaceDoc }));

  return { changes, problems, basePlaceSuggestions };
}
