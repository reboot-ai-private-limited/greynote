import type { HolidayRepositoryPort } from '../domain/holiday.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';

/** The holidays that apply to one employee: National, plus those of every HQ and Zone they cover. */
export class HolidayCalendar {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  async datesFor(userId: string, from: string, to: string): Promise<Set<string>> {
    const place = await this.territory.getUserTerritory(userId);
    return new Set((await this.holidays.listApplicable(from, to, place)).map((h) => h.date));
  }
}
