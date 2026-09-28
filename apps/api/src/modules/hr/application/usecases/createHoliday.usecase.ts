import { AppError } from '@/shared/errors/AppError.js';
import type { Holiday, HolidayScope } from '../../domain/holiday.entity.js';
import type { HolidayRepositoryPort } from '../../domain/holiday.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

export interface CreateHolidayInput {
  name: string;
  date: string;
  scope: HolidayScope;
  zoneIds: string[];
  hqIds: string[];
}

/** `NATIONAL` takes no ids; `ZONE` needs Zones only; `HQ` needs HQs only — each an active one. */
export class CreateHolidayUseCase {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(input: CreateHolidayInput, actorId: string): Promise<Holiday> {
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
    return this.holidays.create({ name: input.name, date: input.date, scope: input.scope, zoneIds, hqIds, createdBy: actorId });
  }
}
