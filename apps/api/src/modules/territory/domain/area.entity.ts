import type { TerritoryStatus } from './territoryStatus.js';

/** Which of a grade's three DA rates applies to a day worked in this Area (HLD 06 §2). */
export const AREA_TYPES = ['HQ', 'EX_STATION', 'OUT_STATION'] as const;
export type AreaType = (typeof AREA_TYPES)[number];

/**
 * An Area under one HQ (e.g. Matigara under Siliguri HQ). Name is unique within its HQ, ignoring
 * case. Every Route in it uses this `type` — no per-Route override (client sign-off D5).
 */
export interface Area {
  id: string;
  hqId: string;
  name: string;
  type: AreaType;
  status: TerritoryStatus;
}
