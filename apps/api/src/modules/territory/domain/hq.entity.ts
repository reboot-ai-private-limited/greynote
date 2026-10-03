import type { Place } from './place.js';
import type { TerritoryStatus } from './territoryStatus.js';

/**
 * A headquarters under one Zone (e.g. SLG-1). Name is unique within its Zone, ignoring case.
 *
 * `basePlace` is where every Route of this HQ starts (e.g. Siliguri) — the origin of its
 * distance (decision-log 2026-10-03). Null only for an HQ that predates it or came from CSV
 * import; such an HQ can't get a Route until an Admin sets it.
 */
export interface Hq {
  id: string;
  zoneId: string;
  name: string;
  basePlace: Place | null;
  status: TerritoryStatus;
}
