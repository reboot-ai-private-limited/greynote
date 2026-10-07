import type { AttendanceMonthDto } from '@greynote/contracts';

export type { AttendanceMonthDto } from '@greynote/contracts';

/** What Payroll takes from a month's attendance. */
export interface DeductibleDays {
  absentDays: number;
  strikeDays: number;
  /** Absent days while `ABSENT_DEDUCTS_SALARY` is on, plus strike days while `STRIKE_DEDUCTS_SALARY` is on; 0 when absent days are not deducted. */
  deductibleDays: number;
}

/** The only thing another module may import from `attendance/`. Months are `YYYY-MM`. */
export interface AttendancePublicContract {
  getMonth(userId: string, month: string): Promise<AttendanceMonthDto>;
  countDeductibleDays(userId: string, month: string): Promise<DeductibleDays>;
}
