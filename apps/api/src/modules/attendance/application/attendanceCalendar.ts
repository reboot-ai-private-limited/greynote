import type { AttendanceMonthDto } from '@greynote/contracts';
import { readConfig, parseBoolean, readBusinessDay, type ConfigReader } from '@/shared/config/readConfig.js';
import { businessDate, daysInMonth, formatCalendarDate, parseCalendarMonth } from '@/shared/time/businessTime.js';
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

/** One person's plan days and reported days, read for many people at once (`AttendanceCalendar.prefetch`). */
export interface Prefetched {
  plans: Array<{ date: string; status: string; workingType: string }>;
  reported: string[];
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

  async today(): Promise<string> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    return businessDate(this.now(), timeZone, dayStart);
  }

  /**
   * For a calendar of many people (2026-11-27): everyone's plan days and reported days in a few queries, handed to `statuses` per person.
   * Without the batched reads it returns nothing, and `statuses` reads per person as before.
   */
  async prefetch(userIds: string[], month: string): Promise<Map<string, Prefetched>> {
    const { from, to } = monthBounds(month);
    const out = new Map<string, Prefetched>();
    if (!this.planning.listDailyPlanDaysForUsers || !this.fieldActivity.listReportedDatesForUsers || userIds.length === 0) return out;
    const [plans, reported] = await Promise.all([this.planning.listDailyPlanDaysForUsers(userIds, from, to), this.fieldActivity.listReportedDatesForUsers(userIds, from, to)]);
    const reportedOf = new Map(reported.map((r) => [r.userId, r.dates]));
    for (const p of plans) out.set(p.userId, { plans: p.days, reported: reportedOf.get(p.userId) ?? [] });
    return out;
  }

  async statuses(userId: string, month: string, pre?: Prefetched): Promise<{ dates: string[]; statuses: DayStatus[] }> {
    const { from, to, dates } = monthBounds(month);
    const { timeZone: zone } = await readBusinessDay(this.config);
    const [today, employment, off, holidays, leave, plans, reported] = await Promise.all([
      this.today(),
      this.identity.getEmploymentDetails(userId),
      this.hr.listOffDates(userId, from, to),
      this.hr.listHolidayDates(userId, from, to),
      this.hr.listLeaveDates(userId, from, to),
      pre ? pre.plans : this.planning.listDailyPlanDays(userId, from, to),
      pre ? pre.reported : this.fieldActivity.listReportedDates(userId, from, to),
    ]);
    const joinedOn = employment?.dateOfJoining ? businessDate(employment.dateOfJoining, zone) /* a date of record: read at midnight, not shifted by the day start */ : null;
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
        leftOn: employment?.lastWorkingDay ?? null,
        rejoinedOn: employment?.rejoinedOn ?? null,
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
