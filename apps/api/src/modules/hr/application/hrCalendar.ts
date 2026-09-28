import { readConfig, parsePositiveInt, type ConfigReader } from '@/shared/config/readConfig.js';
import {
  assertTimeZone,
  businessDate,
  leaveYearOf,
  leaveYearRange,
  parseMonthName,
  parseWeekdayName,
  type WeekdayName,
} from '@/shared/time/businessTime.js';
import { HR_CONFIG_KEYS } from '../domain/configProvider.port.js';

/**
 * HR's calendar settings, read from Config on every call: the leave year's start month, the
 * weekly off day, the backdating limit, and "today" in the business timezone. `now` is injectable
 * so tests don't depend on the clock.
 */
export class HrCalendar {
  constructor(
    private readonly config: ConfigReader,
    readonly now: () => Date = () => new Date(),
  ) {}

  leaveYearStartMonth(): Promise<number> {
    return readConfig(this.config, HR_CONFIG_KEYS.leaveYearStart, parseMonthName);
  }

  weeklyOff(): Promise<WeekdayName> {
    return readConfig(this.config, HR_CONFIG_KEYS.weeklyOff, parseWeekdayName);
  }

  backdateDays(): Promise<number> {
    return readConfig(this.config, HR_CONFIG_KEYS.backdateDays, parsePositiveInt(366));
  }

  async today(): Promise<string> {
    const timeZone = await readConfig(this.config, HR_CONFIG_KEYS.timeZone, (v) => {
      assertTimeZone(v);
      return v;
    });
    return businessDate(this.now(), timeZone);
  }

  async leaveYearOf(date: string): Promise<number> {
    return leaveYearOf(date, await this.leaveYearStartMonth());
  }

  async leaveYearRange(year: number): Promise<{ from: string; to: string }> {
    return leaveYearRange(year, await this.leaveYearStartMonth());
  }
}
