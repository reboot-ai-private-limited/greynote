import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { makeAttendanceControllers } from './attendance.controller.js';
import { monthQuerySchema, payrollCalendarQuerySchema } from './attendance.schemas.js';

const tags = ['Attendance'];
const security = [{ bearerAuth: [] }];
openApiRegistry.registerPath({ method: 'get', path: '/api/attendance/month', tags, summary: 'Admin/HR/Accountant: one employee\'s days in a month (holiday, off, leave, strike, present, absent)', security, request: { query: monthQuerySchema }, responses: { 200: { description: 'The month' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/attendance/payroll-calendar', tags, summary: 'Admin/HR/Accountant: every active field employee\'s month in one line, with the days payroll would deduct', security, request: { query: payrollCalendarQuerySchema }, responses: { 200: { description: 'The calendar' } } });

export function buildAttendanceRouter(c: ReturnType<typeof makeAttendanceControllers>): Router {
  const router = Router();
  router.get('/month', authenticate(), requireRole('ADMIN', 'HR', 'ACCOUNTANT'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: monthQuerySchema }), c.month);
  router.get('/payroll-calendar', authenticate(), requireRole('ADMIN', 'HR', 'ACCOUNTANT'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: payrollCalendarQuerySchema }), c.payrollCalendar);
  return router;
}
