import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertTimeZone, businessDate, parseCalendarMonth, zonedInstant } from '@/shared/time/businessTime.js';

/** "Today" and "the day an instant falls on" in the business timezone, read from Config on every call. `now` is injectable for tests. */
export class DcrClock {
  constructor(
    private readonly config: ConfigReader,
    readonly now: () => Date = () => new Date(),
  ) {}

  private timeZone(): Promise<string> {
    return readConfig(this.config, 'BUSINESS_TIMEZONE', (v) => {
      assertTimeZone(v);
      return v;
    });
  }

  async today(): Promise<string> {
    return businessDate(this.now(), await this.timeZone());
  }

  /** The instants a calendar month spans in the business timezone: `from` inclusive, `to` (the start of the next month) exclusive. */
  async monthRange(month: string): Promise<{ from: Date; to: Date }> {
    const { year, month: m } = parseCalendarMonth(month);
    const zone = await this.timeZone();
    return { from: zonedInstant({ year, month: m, day: 1 }, 0, 0, zone), to: zonedInstant(m === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: m + 1, day: 1 }, 0, 0, zone) };
  }

  /** `dateOf` with the timezone read once: for converting many instants without a configuration lookup each. */
  async dateConverter(): Promise<(instant: Date) => string> {
    const zone = await this.timeZone();
    return (instant) => businessDate(instant, zone);
  }

  async dateOf(instant: Date): Promise<string> {
    return businessDate(instant, await this.timeZone());
  }
}
