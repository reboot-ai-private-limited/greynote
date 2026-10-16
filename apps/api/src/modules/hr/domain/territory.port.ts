/** HR's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  /** Every HQ and Zone the employee covers, or `null` — decides which Zone/HQ holidays apply. */
  getUserTerritory(userId: string): Promise<{ hqIds: string[]; zoneIds: string[] } | null>;
  getHq(hqId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  getZone(zoneId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  findZoneByName(name: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  findHqByName(zoneId: string, name: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
}
