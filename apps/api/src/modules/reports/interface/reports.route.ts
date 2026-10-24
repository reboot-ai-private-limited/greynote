import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { makeReportsControllers } from './reports.controller.js';
import { myMonthQuerySchema, doctorVisitsQuerySchema, dcrCoverageQuerySchema, employeeSalesQuerySchema, dcrYearQuerySchema, orderIdParamsSchema, ordersQuerySchema, salaryYearQuerySchema, salesDashboardQuerySchema, teamOverviewQuerySchema, salesStatementQuerySchema, salesYearQuerySchema, stockQuerySchema, taDaDaysQuerySchema, taDaYearQuerySchema } from './reports.schemas.js';

const tags = ['Reports'];
const security = [{ bearerAuth: [] }];
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/orders', tags, summary: 'Admin: a month of orders (by order date) with names and totals by status', security, request: { query: ordersQuerySchema }, responses: { 200: { description: 'The orders' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/orders/{id}', tags, summary: 'Admin: one order in full, with product names', security, request: { params: orderIdParamsSchema }, responses: { 200: { description: 'The order' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/sales', tags, summary: 'Admin: primary and secondary sales for each month of a financial year (the chart)', security, request: { query: salesYearQuerySchema }, responses: { 200: { description: 'Twelve months' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/sales/statement', tags, summary: 'Admin: one month\'s stock and sales statement per distributor and product', security, request: { query: salesStatementQuerySchema }, responses: { 200: { description: 'The statement' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/stock', tags, summary: 'Admin: a month\'s stock counts of distributors and chemists, with who has not counted and what does not add up', security, request: { query: stockQuerySchema }, responses: { 200: { description: 'The stock report' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/ta-da', tags, summary: 'Admin: accepted TA, DA and reimbursements by month and employee for a financial year', security, request: { query: taDaYearQuerySchema }, responses: { 200: { description: 'The year' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/ta-da/days', tags, summary: 'Admin: one employee\'s accepted expenses in a month, day by day', security, request: { query: taDaDaysQuerySchema }, responses: { 200: { description: 'The days' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/dcr', tags, summary: 'Admin: reported days, calls, follow-ups, geofence results and late submissions by month and employee for a financial year', security, request: { query: dcrYearQuerySchema }, responses: { 200: { description: 'The year' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/dcr/coverage', tags, summary: 'Admin: the doctors assigned to an employee that they did not call on in a month', security, request: { query: dcrCoverageQuerySchema }, responses: { 200: { description: 'The coverage' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/salary', tags, summary: 'Admin: net pay by employee and month for a financial year, with month totals, employer contributions and the TA/DA cost', security, request: { query: salaryYearQuerySchema }, responses: { 200: { description: 'The year' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/sales-dashboard', tags, summary: 'Admin, Accountant or HR (all field employees) or a manager (their downline): plan and daily-report compliance, TA, DA, target and achievement over a date range', security, request: { query: salesDashboardQuerySchema }, responses: { 200: { description: 'The dashboard' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/team/overview', tags, summary: 'Manager (their downline) or Admin: one row per person for a month — working days, plan and daily-report compliance, calls and follow-ups, late and unconfirmed, attendance, TA, DA, target against what was entered', security, request: { query: teamOverviewQuerySchema }, responses: { 200: { description: 'OK' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/employee-sales', tags, summary: 'Admin, Accountant, HR, the employee, or their manager: targets, primary and secondary by product over a run of months', security, request: { query: employeeSalesQuerySchema }, responses: { 200: { description: 'The employee\'s figures' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/doctor-visits', tags, summary: 'Admin (any employee), a manager (themself and their downline) or an employee (themself): each doctor\'s visit frequency against the calls made in a month, with missed calls', security, request: { query: doctorVisitsQuerySchema }, responses: { 200: { description: 'Quota, made and missed per employee and doctor' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/me/ta-da', tags, summary: 'Employee: your own accepted TA, DA and reimbursements by month for a financial year', security, request: { query: taDaYearQuerySchema }, responses: { 200: { description: 'The year' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/me/ta-da/days', tags, summary: 'Employee: your own accepted expenses in a month, day by day', security, request: { query: myMonthQuerySchema }, responses: { 200: { description: 'The days' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/me/dcr', tags, summary: 'Employee: your own reported days, calls, follow-ups and geofence results by month for a financial year', security, request: { query: dcrYearQuerySchema }, responses: { 200: { description: 'The year' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/me/dcr/coverage', tags, summary: 'Employee: the doctors assigned to you that you did not call on in a month', security, request: { query: myMonthQuerySchema }, responses: { 200: { description: 'The coverage' } } });

/** The org-wide reports are Admin only for now (sign-off K24) and read-only. */
export function buildReportsRouter(c: ReturnType<typeof makeReportsControllers>): Router {
  const router = Router();
  router.use(authenticate());
  // The one report a manager may open: the report itself limits a manager to their downline.
  router.get('/sales-dashboard', requireRole('ADMIN', 'ACCOUNTANT', 'HR', 'FIELD'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: false }), validate({ query: salesDashboardQuerySchema }), c.salesDashboard);
  router.get('/team/overview', requireRole('ADMIN', 'FIELD'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: teamOverviewQuerySchema }), c.teamOverview);
  router.get('/employee-sales', requireRole('ADMIN', 'ACCOUNTANT', 'HR', 'FIELD'), scopeToFinancialYear({ kind: 'month', from: 'from', to: 'to', fill: false }), validate({ query: employeeSalesQuerySchema }), c.employeeSales);
  router.get('/doctor-visits', requireRole('ADMIN', 'FIELD'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: doctorVisitsQuerySchema }), c.doctorVisits);
  // The employee's own reports: always the signed-in user's figures; no userId is read.
  router.get('/me/ta-da', requireRole('FIELD'), scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ query: taDaYearQuerySchema }), c.myTaDaYear);
  router.get('/me/ta-da/days', requireRole('FIELD'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: myMonthQuerySchema }), c.myTaDaDays);
  router.get('/me/dcr', requireRole('FIELD'), scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ query: dcrYearQuerySchema }), c.myDcrYear);
  router.get('/me/dcr/coverage', requireRole('FIELD'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: myMonthQuerySchema }), c.myDcrCoverage);
  // The orders list and one order: Admin, and the Accountant, who marks them done from the same screen.
  router.get('/orders', requireRole('ADMIN', 'ACCOUNTANT'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: ordersQuerySchema }), c.orders);
  router.get('/orders/:id', requireRole('ADMIN', 'ACCOUNTANT'), validate({ params: orderIdParamsSchema }), c.order);
  router.use(requireRole('ADMIN'));
  router.get('/sales', scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ query: salesYearQuerySchema }), c.salesYear);
  router.get('/sales/statement', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: salesStatementQuerySchema }), c.salesStatement);
  router.get('/stock', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: stockQuerySchema }), c.stock);
  router.get('/ta-da', scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ query: taDaYearQuerySchema }), c.taDaYear);
  router.get('/ta-da/days', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: taDaDaysQuerySchema }), c.taDaDays);
  router.get('/dcr', scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ query: dcrYearQuerySchema }), c.dcrYear);
  router.get('/dcr/coverage', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: dcrCoverageQuerySchema }), c.dcrCoverage);
  router.get('/salary', scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ query: salaryYearQuerySchema }), c.salaryYear);
  return router;
}
