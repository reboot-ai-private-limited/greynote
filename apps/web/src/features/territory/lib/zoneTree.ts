import type { HqDto, ZoneDto } from '@greynote/contracts';

const byActiveThenName = (a: { status: string; name: string }, b: { status: string; name: string }) =>
  Number(b.status === 'active') - Number(a.status === 'active') || a.name.localeCompare(b.name);

/**
 * The Territory page's Zones list (2026-11-27): zones (active first, by name) with their HQs. A search matches zone names and HQ names:
 * a zone that matches shows all its HQs; otherwise only its HQs that match, and zones with none drop out.
 */
export function zoneTree(zones: readonly ZoneDto[], hqs: readonly HqDto[], search: string): { zone: ZoneDto; hqs: HqDto[] }[] {
  const term = search.trim().toLowerCase();
  return [...zones].sort(byActiveThenName).flatMap((zone) => {
    const own = hqs.filter((h) => h.zoneId === zone.id).sort(byActiveThenName);
    if (!term || zone.name.toLowerCase().includes(term)) return [{ zone, hqs: own }];
    const matching = own.filter((h) => h.name.toLowerCase().includes(term));
    return matching.length > 0 ? [{ zone, hqs: matching }] : [];
  });
}
