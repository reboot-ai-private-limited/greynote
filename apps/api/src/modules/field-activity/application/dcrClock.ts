import { readBusinessDay, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertTimeZone, businessDate, dayStartInstant, parseCalendarMonth } from '@/shared/time/businessTime.js';

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
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    return businessDate(this.now(), timeZone, dayStart);
  }

  /** The instants a calendar month spans in the business timezone: `from` inclusive, `to` (the start of the next month) exclusive. */
  async monthRange(month: string): Promise<{ from: Date; to: Date }> {
    const { year, month: m } = parseCalendarMonth(month);
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    return { from: dayStartInstant({ year, month: m, day: 1 }, dayStart, timeZone), to: dayStartInstant(m === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: m + 1, day: 1 }, dayStart, timeZone) };
  }

  /** `dateOf` with the timezone read once: for converting many instants without a configuration lookup each. */
  async dateConverter(): Promise<(instant: Date) => string> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    return (instant) => businessDate(instant, timeZone, dayStart);
  }

  async dateOf(instant: Date): Promise<string> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    return businessDate(instant, timeZone, dayStart);
  }

  /** A date of record (joining date) read in the business timezone, not shifted by the day start. */
  async calendarDateOf(instant: Date): Promise<string> {
    return businessDate(instant, await this.timeZone());
  }
}
