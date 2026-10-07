import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { AttendanceCalendar } from './application/attendanceCalendar.js';
import type { FieldActivityPort, HrPort, IdentityPort, PlanningPort } from './domain/ports.js';
import { makeAttendanceControllers } from './interface/attendance.controller.js';
import { buildAttendanceRouter } from './interface/attendance.route.js';
import type { AttendancePublicContract } from './attendance.public.js';

export interface AttendanceContainer {
  contract: AttendancePublicContract;
  buildRouter: () => Router;
}

/**
 * Tier 5. Day-by-day status of a field employee — holiday, weekly off, leave, strike, present, absent (decision-log 2026-10-06, sign-off K20, K25,
 * K26). It owns no data: Identity's, HR's, Planning's, Field Activity's and Config's public contracts, passed in by the composition root.
 * Payroll reads the days it deducts; the calendars read the whole month.
 */
export function buildAttendanceContainer(identity: IdentityPort, hr: HrPort, planning: PlanningPort, fieldActivity: FieldActivityPort, config: ConfigReader): AttendanceContainer {
  const calendar = new AttendanceCalendar(identity, hr, planning, fieldActivity, config);
  return {
    contract: {
      getMonth: (userId, month) => calendar.month(userId, month),
      countDeductibleDays: async (userId, month) => {
        const m = await calendar.month(userId, month);
        return { absentDays: m.absentDays, strikeDays: m.strikeDays, deductibleDays: m.deductibleDays };
      },
    },
    buildRouter: () => buildAttendanceRouter(makeAttendanceControllers(calendar, identity)),
  };
}
