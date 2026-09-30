import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { addDays, assertTimeZone, businessDate } from '@/shared/time/businessTime.js';

/** Business timezone and the stock grace days, read from Config on every call. `now` is injectable for tests. */
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

  graceDays(): Promise<number> {
    return readConfig(this.config, 'MONTHLY_STOCK_GRACE_DAYS', (v) => {
      const n = Number(v);
      if (!/^\d+$/.test(v) || n > 31) throw new RangeError(`Not a whole number from 0 to 31: ${v}`);
      return n;
    });
  }

  /** The month that ended most recently, `YYYY-MM` — what the stock-check job looks at by default. */
  async previousMonth(): Promise<string> {
    const today = businessDate(this.now(), await this.timeZone());
    return addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  }
}
