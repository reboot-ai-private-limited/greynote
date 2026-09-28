import {
  assertTimeZone,
  dailyPlanDeadline,
  monthlyPlanDeadline,
  parseTimeOfDay,
} from '@/shared/time/businessTime.js';
import { PLANNING_CONFIG_KEYS, type ConfigProviderPort } from '../domain/configProvider.port.js';
import { parsePositiveInt, readConfig } from './readConfig.js';

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
      readConfig(this.config, PLANNING_CONFIG_KEYS.dailyCutoffTime, (v) => {
        parseTimeOfDay(v);
        return v;
      }),
    ]);
    return dailyPlanDeadline(planDate, cutoffTime, timeZone);
  }

  async monthly(planMonth: string): Promise<Date> {
    const [timeZone, cutoffDay] = await Promise.all([
      this.timeZone(),
      readConfig(this.config, PLANNING_CONFIG_KEYS.monthlyCutoffDay, parsePositiveInt(31)),
    ]);
    return monthlyPlanDeadline(planMonth, cutoffDay, timeZone);
  }

  private timeZone(): Promise<string> {
    return readConfig(this.config, PLANNING_CONFIG_KEYS.timeZone, (v) => {
      assertTimeZone(v);
      return v;
    });
  }
}
