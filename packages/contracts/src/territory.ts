export const TERRITORY_STATUSES = ['active', 'inactive'] as const;
export type TerritoryStatus = (typeof TERRITORY_STATUSES)[number];

export interface ZoneDto {
  id: string;
  name: string;
  status: TerritoryStatus;
}
