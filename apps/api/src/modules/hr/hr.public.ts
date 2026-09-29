/**
 * The only thing another module may import from `hr/`. Dates are calendar days (`YYYY-MM-DD`).
 */
export interface HrPublicContract {
  /** Phase 6's missed-DCR job (PRD §7.5): does a Manager-Approved (or fully approved) leave cover this day? */
  isOnLeave(userId: string, date: string): Promise<boolean>;
  /** Phase 7's Payroll: approved unpaid-leave days falling in this month (`YYYY-MM`). */
  getUnpaidLeaveDays(userId: string, month: string): Promise<number>;
  /** The days in a range that are not working days for this employee: their weekly off day and the holidays that apply. */
  listOffDates(userId: string, from: string, to: string): Promise<string[]>;
  /** The holidays that apply to this employee in a date range (National, their HQ's, its Zone's). */
  listHolidayDates(userId: string, from: string, to: string): Promise<string[]>;
}
