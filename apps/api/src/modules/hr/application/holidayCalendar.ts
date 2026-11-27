import type { HolidayRepositoryPort } from '../domain/holiday.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';

/** The holidays that apply to one employee: National, plus those of every HQ and Zone they cover. */
export class HolidayCalendar {
  /** Reads still running: a second identical request joins the first (2026-11-27 — the attendance calendar asks twice at once). */
  private readonly running = new Map<string, Promise<Set<string>>>();

  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly territory: TerritoryPort,
  ) {}

  datesFor(userId: string, from: string, to: string): Promise<Set<string>> {
    const key = `${userId}|${from}|${to}`;
    let read = this.running.get(key);
    if (!read) {
      read = this.read(userId, from, to).finally(() => this.running.delete(key));
      this.running.set(key, read);
    }
    return read;
  }

  private async read(userId: string, from: string, to: string): Promise<Set<string>> {
    const place = await this.territory.getUserTerritory(userId);
    return new Set((await this.holidays.listApplicable(from, to, place)).map((h) => h.date));
  }
}
