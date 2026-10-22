/** HR's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  /** Every HQ and Zone the employee covers, or `null` — decides which Zone/HQ holidays apply. */
  getUserTerritory(userId: string): Promise<{ hqIds: string[]; zoneIds: string[] } | null>;
  /** The employee's main HQ and its Zone, or `null` — whose holidays lock a day on their Monthly Plan. */
  getUserHq(userId: string): Promise<{ hqId: string; zoneId: string } | null>;
  getHq(hqId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  getZone(zoneId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  findZoneByName(name: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  findHqByName(zoneId: string, name: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
}
