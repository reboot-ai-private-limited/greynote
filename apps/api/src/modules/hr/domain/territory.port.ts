/** HR's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  /** The employee's current HQ and its Zone, or `null` — decides which Zone/HQ holidays apply. */
  getUserHq(userId: string): Promise<{ hqId: string; zoneId: string } | null>;
  getHq(hqId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  getZone(zoneId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
}
