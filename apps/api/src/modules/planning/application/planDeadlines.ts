import {
  assertTimeZone,
  dailyPlanDeadline,
  monthlyPlanDeadline,
  parseCalendarMonth,
  parseTimeOfDay,
  zonedInstant,
} from '@/shared/time/businessTime.js';
import { PLANNING_CONFIG_KEYS, type ConfigProviderPort } from '../domain/configProvider.port.js';
import type { ResubmitPolicy } from '../domain/resubmitWindow.js';
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

  async dailyResubmitPolicy(planDate: string): Promise<ResubmitPolicy> {
    const [timeZone, minutes, latestTime, max] = await Promise.all([
      this.timeZone(),
      readConfig(this.config, PLANNING_CONFIG_KEYS.dailyResubmitGraceMinutes, parsePositiveInt(24 * 60)),
      readConfig(this.config, PLANNING_CONFIG_KEYS.dailyResubmitLatestTime, (v) => {
        parseTimeOfDay(v);
        return v;
      }),
      this.resubmitMax(),
    ]);
    return { graceMs: minutes * 60_000, latest: dailyPlanDeadline(planDate, latestTime, timeZone), max };
  }

  async monthlyResubmitPolicy(planMonth: string): Promise<ResubmitPolicy> {
    const [timeZone, hours, max] = await Promise.all([
      this.timeZone(),
      readConfig(this.config, PLANNING_CONFIG_KEYS.monthlyResubmitGraceHours, parsePositiveInt(24 * 31)),
      this.resubmitMax(),
    ]);
    const { year, month } = parseCalendarMonth(planMonth);
    // The last moment before the month starts.
    const latest = new Date(zonedInstant({ year, month, day: 1 }, 0, 0, timeZone).getTime() - 1);
    return { graceMs: hours * 3_600_000, latest, max };
  }

  private resubmitMax(): Promise<number> {
    return readConfig(this.config, PLANNING_CONFIG_KEYS.resubmitGraceMax, (v) => {
      // 0 is allowed: switches the window off.
      if (!/^\d{1,2}$/.test(v)) throw new RangeError(`Not a whole number from 0 to 99: ${v}`);
      return Number(v);
    });
  }

  private timeZone(): Promise<string> {
    return readConfig(this.config, PLANNING_CONFIG_KEYS.timeZone, (v) => {
      assertTimeZone(v);
      return v;
    });
  }
}
