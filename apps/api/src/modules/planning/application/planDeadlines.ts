import { AppError } from '@/shared/errors/AppError.js';
import {
  assertTimeZone,
  businessDate,
  dailyPlanDeadline,
  monthlyPlanDeadline,
  parseTimeOfDay,
} from '@/shared/time/businessTime.js';
import { PLANNING_CONFIG_KEYS, type ConfigProviderPort } from '../domain/configProvider.port.js';

/**
 * Submit deadlines, read from Config on every call — Admin can change a cutoff or the timezone at
 * runtime and the next submit sees it. `now` is injectable so tests don't depend on the clock.
 */
export class PlanDeadlines {
  constructor(
    private readonly config: ConfigProviderPort,
    readonly now: () => Date = () => new Date(),
  ) {}

  async daily(planDate: string): Promise<Date> {
    const [timeZone, cutoffTime] = await Promise.all([
      this.timeZone(),
      this.read(PLANNING_CONFIG_KEYS.dailyCutoffTime, (v) => {
        parseTimeOfDay(v);
        return v;
      }),
    ]);
    return dailyPlanDeadline(planDate, cutoffTime, timeZone);
  }

  async monthly(planMonth: string): Promise<Date> {
    const [timeZone, cutoffDay] = await Promise.all([
      this.timeZone(),
      this.read(PLANNING_CONFIG_KEYS.monthlyCutoffDay, (v) => {
        const day = Number(v);
        if (!/^\d{1,2}$/.test(v) || day < 1 || day > 31) throw new RangeError(`Not a day of the month: ${v}`);
        return day;
      }),
    ]);
    return monthlyPlanDeadline(planMonth, cutoffDay, timeZone);
  }

  /** Today's calendar day in the business timezone. */
  async today(): Promise<string> {
    return businessDate(this.now(), await this.timeZone());
  }

  private timeZone(): Promise<string> {
    return this.read(PLANNING_CONFIG_KEYS.timeZone, (v) => {
      assertTimeZone(v);
      return v;
    });
  }

  /** Config doesn't validate values on write, so a malformed one surfaces here, naming its key. */
  private async read<T>(key: string, parse: (value: string) => T): Promise<T> {
    const value = await this.config.get(key);
    try {
      return parse(value);
    } catch (err) {
      throw AppError.internal('INTERNAL', { reason: 'CONFIG_VALUE_INVALID', key, value }, err);
    }
  }
}
