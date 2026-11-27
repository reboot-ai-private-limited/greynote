import type { HqDto } from '@greynote/contracts';

/**
 * The All routes tab's Zone → HQ filters (2026-11-27): the HQ list shows only the chosen zone's HQs (all HQs with no zone chosen), active
 * first, by name.
 */
export function hqFilterOptions(hqs: readonly HqDto[], zoneId: string): { value: string; label: string }[] {
  return hqs
    .filter((h) => !zoneId || h.zoneId === zoneId)
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || a.name.localeCompare(b.name))
    .map((h) => ({ value: h.id, label: h.status === 'active' ? h.name : `${h.name} (inactive)` }));
}

/** Choosing a zone keeps the HQ only when it is in that zone; choosing an HQ sets its zone. */
export function pickZone(hqs: readonly HqDto[], current: { hqId: string }, zoneId: string): { zoneId: string; hqId: string } {
  const keep = !zoneId || hqs.find((h) => h.id === current.hqId)?.zoneId === zoneId;
  return { zoneId, hqId: keep ? current.hqId : '' };
}

export function pickHq(hqs: readonly HqDto[], current: { zoneId: string }, hqId: string): { zoneId: string; hqId: string } {
  return { hqId, zoneId: hqId ? (hqs.find((h) => h.id === hqId)?.zoneId ?? current.zoneId) : current.zoneId };
}
