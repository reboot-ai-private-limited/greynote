import { weeklyOffsBetween, type WeeklyOffDateDto } from '@greynote/contracts';
import type { HrCalendar } from '../hrCalendar.js';

/** The weekly off dates of a range, computed from the schedule: "Sunday", "1st Saturday". The same for everyone. */
export class ListWeeklyOffsUseCase {
  constructor(private readonly calendar: HrCalendar) {}

  async execute(range: { from: string; to: string }): Promise<WeeklyOffDateDto[]> {
    return weeklyOffsBetween(range.from, range.to, await this.calendar.weeklyOffSchedule());
  }
}
