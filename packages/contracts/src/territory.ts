export const TERRITORY_STATUSES = ['active', 'inactive'] as const;
export type TerritoryStatus = (typeof TERRITORY_STATUSES)[number];

/** Which of a grade's three DA rates applies to a day worked in an Area. */
export const AREA_TYPES = ['HQ', 'EX_STATION', 'OUT_STATION'] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export interface ZoneDto {
  id: string;
  name: string;
  status: TerritoryStatus;
}

export interface HqDto {
  id: string;
  zoneId: string;
  name: string;
  status: TerritoryStatus;
}

export interface AreaDto {
  id: string;
  hqId: string;
  name: string;
  type: AreaType;
  status: TerritoryStatus;
}

export interface CreateZoneDto {
  name: string;
}
/** At least one field; the server rejects an empty update. */
export interface UpdateZoneDto {
  name?: string | undefined;
  status?: TerritoryStatus | undefined;
}

export interface CreateHqDto {
  zoneId: string;
  name: string;
}
export type UpdateHqDto = UpdateZoneDto;

export interface CreateAreaDto {
  hqId: string;
  name: string;
  type: AreaType;
}
export interface UpdateAreaDto {
  name?: string | undefined;
  type?: AreaType | undefined;
  status?: TerritoryStatus | undefined;
}
