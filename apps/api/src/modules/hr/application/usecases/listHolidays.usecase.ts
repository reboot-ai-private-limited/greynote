import type { Holiday } from '../../domain/holiday.entity.js';
import type { HolidayFilter, HolidayRepositoryPort } from '../../domain/holiday.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import { isHrOrAdmin, type Actor } from '../actor.js';

/** HR/Admin: every holiday, filterable. Anyone else: the ones that apply to them. */
export class ListHolidaysUseCase {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async execute(actor: Actor, filter: HolidayFilter): Promise<Holiday[]> {
    if (isHrOrAdmin(actor)) return this.holidays.list(filter);
    return this.holidays.listApplicable(filter.from, filter.to, await this.territory.getUserHq(actor.id));
  }
}
