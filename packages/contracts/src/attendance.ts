/**
 * What each working day of an employee was, worked out from the holiday calendar, leave, the approved plan and the submitted report
 * (decision-log 2026-10-06, sign-off K20, K25, K26). First match wins, in this order. `UNKNOWN` is a past working day that would have been
 * absent, for an employee whose joining date is not recorded: it is never deducted, because without it we cannot tell absent from not yet joined.
 */
export const DAY_STATUSES = ['NOT_YET', 'BEFORE_JOINING', 'HOLIDAY', 'WEEKLY_OFF', 'LEAVE', 'STRIKE', 'PRESENT', 'ABSENT', 'UNKNOWN'] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

export interface AttendanceDayDto {
  /** `YYYY-MM-DD`. */
  date: string;
  status: DayStatus;
}

/** `GET /attendance/month`: one employee, one month. */
export interface AttendanceMonthDto {
  userId: string;
  /** `YYYY-MM`. */
  month: string;
  days: AttendanceDayDto[];
  counts: Record<DayStatus, number>;
  /** Working days with nothing to account for them. */
  absentDays: number;
  strikeDays: number;
  /** The days payroll would deduct: absent days while `ABSENT_DEDUCTS_SALARY` is on, plus strike days while `STRIKE_DEDUCTS_SALARY` is on. */
  deductibleDays: number;
  absentDeducts: boolean;
  strikeDeducts: boolean;
}

/** One row of `GET /attendance/payroll-calendar`: an employee's month in one line. */
export interface PayrollCalendarRowDto {
  user: { id: string; name: string; employeeCode: string };
  /** One status per day of the month, in date order. */
  days: DayStatus[];
  counts: Record<DayStatus, number>;
  absentDays: number;
  strikeDays: number;
  deductibleDays: number;
}

export interface PayrollCalendarDto {
  month: string;
  /** The month's dates, in order, so a row's `days[i]` is `dates[i]`. */
  dates: string[];
  absentDeducts: boolean;
  strikeDeducts: boolean;
  rows: PayrollCalendarRowDto[];
}
