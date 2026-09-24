import type { TerritoryStatus } from './territoryStatus.js';

/** A headquarters under one Zone (e.g. Siliguri HQ). Name is unique within its Zone, ignoring case. */
export interface Hq {
  id: string;
  zoneId: string;
  name: string;
  status: TerritoryStatus;
}
