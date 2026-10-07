import type { AttendanceMonthDto, PayrollCalendarDto } from '@greynote/contracts';
import { request } from '../client';

export const attendanceApi = {
  /** One employee's days in a month (`YYYY-MM`); the month must fall in the financial year in view. */
  month: (token: string, query: { userId: string; month: string }, signal?: AbortSignal) =>
    request<AttendanceMonthDto>('/attendance/month', { token, query: { ...query }, signal }),
  /** Every active field employee's month, one row each, with what payroll would deduct. */
  payrollCalendar: (token: string, query: { month: string }, signal?: AbortSignal) =>
    request<PayrollCalendarDto>('/attendance/payroll-calendar', { token, query: { ...query }, signal }),
};
