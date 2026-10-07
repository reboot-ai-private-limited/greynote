'use client';

import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from '@/lib/api/endpoints/attendance';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

/** One employee's month. Live: a report submitted or a leave approved changes it. */
export function useAttendanceMonth(userId: string, month: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.attendance.month(userId, month),
      fetch: (token, signal) => attendanceApi.month(token, { userId, month }, signal),
      staleTime: staleTime.live,
      enabled: month !== '',
    }),
  );
}

export function usePayrollCalendar(month: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.attendance.payroll(month),
      fetch: (token, signal) => attendanceApi.payrollCalendar(token, { month }, signal),
      staleTime: staleTime.live,
      enabled: month !== '',
    }),
  );
}
