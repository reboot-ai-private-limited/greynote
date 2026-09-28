/**
 * The only thing another module may import from `hr/`. Dates are calendar days (`YYYY-MM-DD`).
 */
export interface HrPublicContract {
  /** The holidays that apply to this employee in a date range (National, their HQ's, its Zone's). */
  listHolidayDates(userId: string, from: string, to: string): Promise<string[]>;
}
