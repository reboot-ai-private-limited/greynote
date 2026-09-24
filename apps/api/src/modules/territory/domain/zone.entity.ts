import type { TerritoryStatus } from './territoryStatus.js';

/** Top of the hierarchy (e.g. West Bengal Zone). Name is unique across all Zones, ignoring case. */
export interface Zone {
  id: string;
  name: string;
  status: TerritoryStatus;
}
