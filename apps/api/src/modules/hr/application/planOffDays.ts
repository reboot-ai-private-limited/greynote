import { weeklyOffLabel, type WeeklyOffVersion } from '@greynote/contracts';
import { eachDate } from '@/shared/time/businessTime.js';
import type { HolidayRepositoryPort } from '../domain/holiday.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';

/** A day an employee can't plan work on. */
export interface PlanOffDay {
  date: string;
  reason: 'WEEKLY_OFF' | 'HOLIDAY';
  /** The holiday's name, several on one day joined with " / "; `null` for a weekly off. */
  name: string | null;
}

/**
 * The days of a range locked on an employee's Monthly Plan (decision-log 2026-10-22): the weekly off day, and the holidays
 * that are National or tagged with the employee's **main** HQ or its Zone. Narrower than leave counting on purpose, which
 * follows every HQ and Zone they cover: a holiday in one of a ZSM's ten HQs doesn't take their day, they can work elsewhere.
 * With no main HQ set, only National holidays lock a day. A holiday on the weekly off day reads as the holiday.
 */
export class PlanOffDays {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly weeklyOff: () => Promise<WeeklyOffVersion[]>,
  ) {}

  async list(userId: string, from: string, to: string): Promise<PlanOffDay[]> {
    if (from > to) return [];
    const [hq, weeklyOff] = await Promise.all([this.territory.getUserHq(userId), this.weeklyOff()]);
    const place = hq ? { hqIds: [hq.hqId], zoneIds: [hq.zoneId] } : null;
    const names = new Map<string, string[]>();
    for (const h of await this.holidays.listApplicable(from, to, place)) names.set(h.date, [...(names.get(h.date) ?? []), h.name]);
    return eachDate(from, to).flatMap((date): PlanOffDay[] => {
      const holiday = names.get(date);
      if (holiday) return [{ date, reason: 'HOLIDAY', name: [...new Set(holiday)].join(' / ') }];
      return weeklyOffLabel(date, weeklyOff) ? [{ date, reason: 'WEEKLY_OFF', name: null }] : [];
    });
  }
}
