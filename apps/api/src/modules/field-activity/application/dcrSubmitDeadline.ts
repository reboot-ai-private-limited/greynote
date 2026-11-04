import { dayStartInstant, parseCalendarMonth } from '@/shared/time/businessTime.js';
import { readBusinessDay, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';

const parseCutoffDay = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n > 28) throw new RangeError(`Not a whole number from 0 to 28: ${value}`);
  return n;
};

/**
 * When a day's report must be in (decision-log 2026-11-04, amended 2026-11-05): **before** business day `DCR_SUBMIT_CUTOFF_DAY` of the
 * month after the report's month begins, so `1` means by the end of the month's last day, in time for the salary run on the 1st
 * (`SALARY_RUN_DAY`). `0` means no deadline. Read from Config on every call so an Admin's change applies at once.
 */
export class DcrSubmitDeadline {
  constructor(private readonly config: ConfigReader) {}

  /** The last instant at which `reportDate` (`YYYY-MM-DD`) can still be recorded or submitted without an Admin exception, or `null`. */
  async of(reportDate: string): Promise<Date | null> {
    return this.ofMonth(reportDate.slice(0, 7));
  }

  /** The same for a whole month (`YYYY-MM`): the last instant any of its days can still be reported on time. */
  async ofMonth(month: string): Promise<Date | null> {
    const day = await readConfigOr(this.config, 'DCR_SUBMIT_CUTOFF_DAY', parseCutoffDay, 0);
    if (day === 0) return null;
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    const { year, month: m } = parseCalendarMonth(month);
    const next = m === 12 ? { year: year + 1, month: 1 } : { year, month: m + 1 };
    return new Date(dayStartInstant({ ...next, day }, dayStart, timeZone).getTime() - 1);
  }
}
