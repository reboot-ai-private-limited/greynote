import { randomUUID } from 'node:crypto';
import { AppError } from '@/shared/errors/AppError.js';
import { eachDate } from '@/shared/time/businessTime.js';
import { MAX_HOLIDAY_DAYS, type Holiday, type HolidayScope } from '../../domain/holiday.entity.js';
import type { HolidayRepositoryPort } from '../../domain/holiday.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

export interface CreateHolidayInput {
  name: string;
  date: string;
  /** The last day of a holiday that runs several days (Durga Puja, 2–8 Oct); omitted or equal to `date`: one day. */
  endDate?: string | undefined;
  scope: HolidayScope;
  zoneIds: string[];
  hqIds: string[];
}

/**
 * `NATIONAL` takes no ids; `ZONE` needs Zones only; `HQ` needs HQs only — each an active one. A range is stored as
 * one row per day sharing a `groupId`, so everything that reads holidays by date works unchanged.
 */
export class CreateHolidayUseCase {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly newId: () => string = randomUUID,
  ) {}

  async execute(input: CreateHolidayInput, actorId: string): Promise<Holiday[]> {
    const endDate = input.endDate ?? input.date;
    if (endDate < input.date) {
      throw AppError.badRequest('The last day is before the first day.', { field: 'endDate' });
    }
    const dates = eachDate(input.date, endDate);
    if (dates.length > MAX_HOLIDAY_DAYS) {
      throw AppError.badRequest(`A holiday can run at most ${MAX_HOLIDAY_DAYS} days.`, { field: 'endDate' });
    }
    const zoneIds = [...new Set(input.zoneIds)];
    const hqIds = [...new Set(input.hqIds)];
    if (input.scope === 'NATIONAL' && (zoneIds.length || hqIds.length)) {
      throw AppError.badRequest('A national holiday isn’t tagged with Zones or HQs.', { field: 'scope' });
    }
    if (input.scope === 'ZONE' && (!zoneIds.length || hqIds.length)) {
      throw AppError.badRequest('A Zone holiday needs at least one Zone, and no HQs.', { field: 'zoneIds' });
    }
    if (input.scope === 'HQ' && (!hqIds.length || zoneIds.length)) {
      throw AppError.badRequest('An HQ holiday needs at least one HQ, and no Zones.', { field: 'hqIds' });
    }
    for (const id of zoneIds) {
      if ((await this.territory.getZone(id))?.status !== 'active') {
        throw AppError.badRequest('A Zone on this holiday doesn’t exist or is inactive.', { field: 'zoneIds', id });
      }
    }
    for (const id of hqIds) {
      if ((await this.territory.getHq(id))?.status !== 'active') {
        throw AppError.badRequest('An HQ on this holiday doesn’t exist or is inactive.', { field: 'hqIds', id });
      }
    }
    const groupId = dates.length > 1 ? this.newId() : null;
    return this.holidays.createMany(dates.map((date) => ({ name: input.name, date, scope: input.scope, zoneIds, hqIds, groupId, createdBy: actorId })));
  }
}
