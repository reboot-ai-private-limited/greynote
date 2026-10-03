import type { AreaDto, HqDto, RouteDto, ZoneDto } from '@greynote/contracts';

/**
 * Names for a Route's place in Zone → HQ → Area → Route, so a picker or a table can say
 * "Siliguri · Matigara · Route 1" instead of an id. A Route name alone repeats across Areas.
 */
export interface TerritoryDirectory {
  /** "HQ · Area · Route" for any Route id, active or not; `—` for an id it does not know. */
  routeLabel: (routeId: string) => string;
  /** Active Routes only, sorted by label: what a picker offers. */
  routeOptions: { value: string; label: string }[];
  /** A Route's Zone, HQ and Area ids, for filtering. */
  pathOf: (routeId: string) => { zoneId: string; hqId: string; areaId: string } | null;
}

export function buildTerritoryDirectory(input: {
  zones: readonly ZoneDto[];
  hqs: readonly HqDto[];
  areas: readonly AreaDto[];
  routes: readonly RouteDto[];
}): TerritoryDirectory {
  const hqById = new Map(input.hqs.map((h) => [h.id, h]));
  const areaById = new Map(input.areas.map((a) => [a.id, a]));
  void input.zones; // Zones are not in the label (HQ names are distinct enough), but a path reports the Zone id.

  const label = (route: RouteDto): string => {
    const area = areaById.get(route.areaId);
    const hq = area ? hqById.get(area.hqId) : undefined;
    return [hq?.name, area?.name, route.name].filter(Boolean).join(' · ');
  };
  const labels = new Map(input.routes.map((r) => [r.id, label(r)]));
  const routeById = new Map(input.routes.map((r) => [r.id, r]));

  return {
    routeLabel: (id) => labels.get(id) ?? '—',
    routeOptions: input.routes
      .filter((r) => r.status === 'active')
      .map((r) => ({ value: r.id, label: labels.get(r.id) ?? r.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    pathOf: (id) => {
      const route = routeById.get(id);
      const area = route ? areaById.get(route.areaId) : undefined;
      const hq = area ? hqById.get(area.hqId) : undefined;
      return route && area && hq ? { zoneId: hq.zoneId, hqId: hq.id, areaId: area.id } : null;
    },
  };
}
