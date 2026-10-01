import type { AreaDto, HqDto, TerritoryStatus, ZoneDto } from '@greynote/contracts';

/** Territory-specific tree rules: the rows of the flat search view and their breadcrumbs. */

/** `Zone › HQ`. A parent we do not have (beyond the first picker page) shows as `—`. */
export function breadcrumb(parts: readonly (string | undefined)[]): string {
  return parts.map((p) => p ?? '—').join(' › ');
}

export type NodeKind = 'zone' | 'hq' | 'area';

export interface SearchRow {
  key: string;
  kind: NodeKind;
  id: string;
  name: string;
  status: TerritoryStatus;
  /** `Zone › HQ` for the row's ancestors; empty for a zone. */
  path: string;
}

interface Lookups {
  zoneName: (id: string) => string | undefined;
  hqName: (id: string) => string | undefined;
  hqZoneId: (id: string) => string | undefined;
}

/** Zones, then HQs, then areas — the flat result list the tree is replaced by while searching. */
export function searchRows(
  found: { zones: readonly ZoneDto[]; hqs: readonly HqDto[]; areas: readonly AreaDto[] },
  lookups: Lookups,
): SearchRow[] {
  return [
    ...found.zones.map((z): SearchRow => ({ key: `zone:${z.id}`, kind: 'zone', id: z.id, name: z.name, status: z.status, path: '' })),
    ...found.hqs.map(
      (h): SearchRow => ({
        key: `hq:${h.id}`,
        kind: 'hq',
        id: h.id,
        name: h.name,
        status: h.status,
        path: breadcrumb([lookups.zoneName(h.zoneId)]),
      }),
    ),
    ...found.areas.map(
      (a): SearchRow => ({
        key: `area:${a.id}`,
        kind: 'area',
        id: a.id,
        name: a.name,
        status: a.status,
        path: breadcrumb([lookups.zoneName(lookups.hqZoneId(a.hqId) ?? ''), lookups.hqName(a.hqId)]),
      }),
    ),
  ];
}
