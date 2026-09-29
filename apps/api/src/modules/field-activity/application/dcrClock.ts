import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertTimeZone, businessDate } from '@/shared/time/businessTime.js';

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

  async dateOf(instant: Date): Promise<string> {
    return businessDate(instant, await this.timeZone());
  }
}
