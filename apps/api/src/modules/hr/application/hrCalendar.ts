import { readConfig, readBusinessDay, type ConfigReader } from '@/shared/config/readConfig.js';
import {
  businessDate,
  leaveYearOf,
  leaveYearRange,
  parseMonthName,
  parseWeekdayName,
  type WeekdayName,
} from '@/shared/time/businessTime.js';
import { HR_CONFIG_KEYS } from '../domain/configProvider.port.js';

/** 0 is allowed: no backdating. */
const parseDays = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n > 366) throw new RangeError(`Not a whole number from 0 to 366: ${value}`);
  return n;
};

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
    return readConfig(this.config, HR_CONFIG_KEYS.backdateDays, parseDays);
  }

  async today(): Promise<string> {
    return this.dateOf(this.now());
  }

  /** The calendar day an instant falls on in the business timezone. */
  async dateOf(instant: Date): Promise<string> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    return businessDate(instant, timeZone, dayStart);
  }

  /** A date of record (joining date, DOB) read in the business timezone, not shifted by the day start. */
  async calendarDateOf(instant: Date): Promise<string> {
    const { timeZone } = await readBusinessDay(this.config);
    return businessDate(instant, timeZone);
  }

  async leaveYearOf(date: string): Promise<number> {
    return leaveYearOf(date, await this.leaveYearStartMonth());
  }

  async leaveYearRange(year: number): Promise<{ from: string; to: string }> {
    return leaveYearRange(year, await this.leaveYearStartMonth());
  }
}
