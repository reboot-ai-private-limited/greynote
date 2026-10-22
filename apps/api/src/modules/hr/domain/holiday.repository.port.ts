import type { Holiday, HolidayScope } from './holiday.entity.js';

export interface HolidayFilter {
  from: string;
  to: string;
  scope?: HolidayScope | undefined;
  zoneId?: string | undefined;
  hqId?: string | undefined;
}

export interface HolidayRepositoryPort {
  findById(id: string): Promise<Holiday | null>;
  /** Oldest first; both ends inclusive. */
  list(filter: HolidayFilter): Promise<Holiday[]>;
  /** National ones plus those tagged with this HQ or Zone, oldest first. */
  listApplicable(from: string, to: string, place: { hqIds: string[]; zoneIds: string[] } | null): Promise<Holiday[]>;
  /** Holidays scoped to any of these Zones or HQs. */
  countScopedTo(scope: { zoneIds: string[]; hqIds: string[] }): Promise<number>;
  create(input: Omit<Holiday, 'id' | 'createdAt'>): Promise<Holiday>;
  /** One write, returned in the order given. */
  createMany(inputs: Omit<Holiday, 'id' | 'createdAt'>[]): Promise<Holiday[]>;
  delete(id: string): Promise<boolean>;
  /** Every day of a holiday added as a range; how many were removed. */
  deleteGroup(groupId: string): Promise<number>;
}
