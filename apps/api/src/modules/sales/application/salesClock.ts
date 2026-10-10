import { readConfig, readDayStart, type ConfigReader } from '@/shared/config/readConfig.js';
import { addDays, assertTimeZone, businessDate } from '@/shared/time/businessTime.js';

/** Business timezone and the stock deadline day, read from Config on every call. `now` is injectable for tests. */
export class SalesClock {
  constructor(
    private readonly config: ConfigReader,
    readonly now: () => Date = () => new Date(),
  ) {}

  timeZone(): Promise<string> {
    return readConfig(this.config, 'BUSINESS_TIMEZONE', (v) => {
      assertTimeZone(v);
      return v;
    });
  }

  /** When the business day rolls over (`HH:mm`). */
  dayStart(): Promise<string> {
    return readDayStart(this.config);
  }

  deadlineDay(): Promise<number> {
    return readConfig(this.config, 'MONTHLY_STOCK_DEADLINE_DAY', (v) => {
      const n = Number(v);
      if (!/^\d+$/.test(v) || n < 1 || n > 28) throw new RangeError(`Not a whole number from 1 to 28: ${v}`);
      return n;
    });
  }

  async today(): Promise<string> {
    return businessDate(this.now(), await this.timeZone(), await this.dayStart());
  }

  /** The month that ended most recently, `YYYY-MM` — what the stock-check job looks at by default. */
  async previousMonth(): Promise<string> {
    const today = businessDate(this.now(), await this.timeZone(), await this.dayStart());
    return addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  }
}
