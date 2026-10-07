import type { PayrollCalendarDto } from '@greynote/contracts';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { AttendanceCalendar } from '../application/attendanceCalendar.js';
import { monthBounds } from '../application/attendanceCalendar.js';
import { countStatuses, deductibleDays } from '../domain/dayStatus.js';
import type { IdentityPort } from '../domain/ports.js';
import type { monthQuerySchema, payrollCalendarQuerySchema } from './attendance.schemas.js';

export function makeAttendanceControllers(calendar: AttendanceCalendar, identity: IdentityPort): Record<'month' | 'payrollCalendar', RequestHandler> {
  return {
    month: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof monthQuerySchema>;
      const [summary] = await identity.getUserSummaries([q.userId]);
      if (!summary) throw AppError.notFound();
      sendSuccess(req, res, await calendar.month(q.userId, q.month), 'Attendance for the month.', 200);
    }),
    // Every active field employee, one line each. The calendar is built per employee (a few queries each), a few at a time.
    payrollCalendar: asyncHandler(async (req, res) => {
      const { month } = req.query as unknown as z.output<typeof payrollCalendarQuerySchema>;
      const ids = await identity.listActiveFieldUserIds();
      const [people, settings] = await Promise.all([identity.getUserSummaries(ids), calendar.settings()]);
      const byId = new Map(people.map((p) => [p.id, p]));
      const rows: PayrollCalendarDto['rows'] = [];
      for (let i = 0; i < ids.length; i += 8) {
        const batch = await Promise.all(ids.slice(i, i + 8).map(async (id) => ({ id, built: await calendar.statuses(id, month) })));
        for (const { id, built } of batch) {
          const user = byId.get(id);
          if (!user) continue;
          const counts = countStatuses(built.statuses);
          rows.push({ user: { id: user.id, name: user.name, employeeCode: user.employeeCode }, days: built.statuses, counts, absentDays: counts.ABSENT, strikeDays: counts.STRIKE, deductibleDays: deductibleDays(built.statuses, settings) });
        }
      }
      rows.sort((a, b) => a.user.name.localeCompare(b.user.name));
      const body: PayrollCalendarDto = { month, dates: monthBounds(month).dates, absentDeducts: settings.absentDeducts, strikeDeducts: settings.strikeDeducts, rows };
      sendSuccess(req, res, body, 'Payroll calendar.', 200);
    }),
  };
}
