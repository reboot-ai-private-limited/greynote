import type { AttendanceMonthDto } from '@greynote/contracts';
import { readConfig, parseBoolean, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertTimeZone, businessDate, daysInMonth, formatCalendarDate, parseCalendarMonth } from '@/shared/time/businessTime.js';
import { classifyDay, countStatuses, deductibleDays, type DayStatus, type DeductionSettings } from '../domain/dayStatus.js';
import type { FieldActivityPort, HrPort, IdentityPort, PlanningPort } from '../domain/ports.js';

/** A plan past the manager (the DCR gate's own rule): a draft or rejected Strike plan excuses nothing. */
const PAST_MANAGER = new Set(['MANAGER_APPROVED', 'APPROVED']);

/** The first and last day of a month (`YYYY-MM`). */
export function monthBounds(month: string): { from: string; to: string; dates: string[] } {
  const { year, month: m } = parseCalendarMonth(month);
  const last = daysInMonth(year, m);
  const dates = Array.from({ length: last }, (_, i) => formatCalendarDate({ year, month: m, day: i + 1 }));
  return { from: dates[0]!, to: dates[last - 1]!, dates };
}

/**
 * Builds one employee's month, day by day, from the holiday calendar and weekly off, approved leave, the approved daily plan and the
 * submitted reports — a handful of queries per employee, not one per day. Reads only; the rule itself is `classifyDay`.
 */
export class AttendanceCalendar {
  constructor(
    private readonly identity: IdentityPort,
    private readonly hr: HrPort,
    private readonly planning: PlanningPort,
    private readonly fieldActivity: FieldActivityPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async settings(): Promise<DeductionSettings> {
    const [absentDeducts, strikeDeducts] = await Promise.all([readConfig(this.config, 'ABSENT_DEDUCTS_SALARY', parseBoolean), readConfig(this.config, 'STRIKE_DEDUCTS_SALARY', parseBoolean)]);
    return { absentDeducts, strikeDeducts };
  }

  private async zone(): Promise<string> {
    return readConfig(this.config, 'BUSINESS_TIMEZONE', (v) => {
      assertTimeZone(v);
      return v;
    });
  }

  async today(): Promise<string> {
    return businessDate(this.now(), await this.zone());
  }

  async statuses(userId: string, month: string): Promise<{ dates: string[]; statuses: DayStatus[] }> {
    const { from, to, dates } = monthBounds(month);
    const zone = await this.zone();
    const [today, employment, off, holidays, leave, plans, reported] = await Promise.all([
      this.today(),
      this.identity.getEmploymentDetails(userId),
      this.hr.listOffDates(userId, from, to),
      this.hr.listHolidayDates(userId, from, to),
      this.hr.listLeaveDates(userId, from, to),
      this.planning.listDailyPlanDays(userId, from, to),
      this.fieldActivity.listReportedDates(userId, from, to),
    ]);
    const joinedOn = employment?.dateOfJoining ? businessDate(employment.dateOfJoining, zone) : null;
    const holidaySet = new Set(holidays);
    const offSet = new Set(off);
    const leaveSet = new Set(leave);
    const reportedSet = new Set(reported);
    const strikeSet = new Set(plans.filter((p) => p.workingType === 'STRIKE' && PAST_MANAGER.has(p.status)).map((p) => p.date));
    const statuses = dates.map((date) =>
      classifyDay({
        date,
        today,
        joinedOn,
        holiday: holidaySet.has(date),
        weeklyOff: offSet.has(date) && !holidaySet.has(date),
        onLeave: leaveSet.has(date),
        strikePlan: strikeSet.has(date),
        reported: reportedSet.has(date),
      }),
    );
    return { dates, statuses };
  }

  async month(userId: string, month: string): Promise<AttendanceMonthDto> {
    const [{ dates, statuses }, settings] = await Promise.all([this.statuses(userId, month), this.settings()]);
    const counts = countStatuses(statuses);
    return {
      userId,
      month,
      days: dates.map((date, i) => ({ date, status: statuses[i]! })),
      counts,
      absentDays: counts.ABSENT,
      strikeDays: counts.STRIKE,
      deductibleDays: deductibleDays(statuses, settings),
      absentDeducts: settings.absentDeducts,
      strikeDeducts: settings.strikeDeducts,
    };
  }
}
