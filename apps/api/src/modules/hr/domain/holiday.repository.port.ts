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
  listApplicable(from: string, to: string, place: { hqId: string; zoneId: string } | null): Promise<Holiday[]>;
  create(input: Omit<Holiday, 'id' | 'createdAt'>): Promise<Holiday>;
  delete(id: string): Promise<boolean>;
}
