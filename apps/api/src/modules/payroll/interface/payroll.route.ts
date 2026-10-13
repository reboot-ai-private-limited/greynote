import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { PayrollHandlers } from './payroll.controller.js';
import { adjustAmountBodySchema, generateBodySchema, idParamsSchema, listRunsQuerySchema, myPayslipsQuerySchema, overrideDayBodySchema, overviewQuerySchema, payBodySchema } from './payroll.schemas.js';

const TAG = 'Payroll';

function doc(method: 'get' | 'post' | 'patch', path: string, summary: string, request: { query?: ZodTypeAny; body?: ZodTypeAny; params?: AnyZodObject } = {}): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/payroll${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { ...(request.query && { query: request.query as AnyZodObject }), ...(request.params && { params: request.params }), ...(request.body && { body: { content: { 'application/json': { schema: request.body } } } }) },
    responses: { 200: { description: 'OK' }, 409: { description: 'The month has not ended, or the run is already finalized' } },
  });
}
doc('post', '/generate', 'Accountant/Admin: generate (or recompute) the DRAFT payroll for a month that has ended — every active field employee, or the userIds given. One outcome per employee; a finalized run is never overwritten', { body: generateBodySchema });
doc('post', '/{id}/finalize', 'Accountant/Admin: lock a DRAFT run. Once only; a second call is a 409', { params: idParamsSchema });
doc('get', '/overview', 'Admin, HR, Accountant: every active field employee\'s salary for a month — base, deductions, adjustments, net and where it stands (not generated, draft, finalized, paid)', { query: overviewQuerySchema });
doc('post', '/{id}/days', 'Admin, HR: charge one day of a DRAFT run 0, a half or a whole day instead of what the rules gave, with a reason; kept with who and when', { params: idParamsSchema, body: overrideDayBodySchema });
doc('post', '/{id}/adjustments', 'Admin, HR: add (positive) or take off (negative) an amount on a DRAFT run, with a reason; kept with who and when', { params: idParamsSchema, body: adjustAmountBodySchema });
doc('post', '/{id}/pay', 'Accountant/Admin: mark a FINALIZED run\'s salary paid, with an optional reference. Once', { params: idParamsSchema, body: payBodySchema });
doc('get', '/me', 'Field employee: my own finalized payslips, for the financial year in view (X-Financial-Year), or a month range inside it', { query: myPayslipsQuerySchema });
doc('get', '/{id}', 'One payroll run', { params: idParamsSchema });
doc('get', '/', 'Payroll runs, filterable by month, employee and status', { query: listRunsQuerySchema });

export function buildPayrollRouter(c: PayrollHandlers): Router {
  const router = Router();
  router.use(authenticate());
  // The employee's own slips come first so `me` is never read as an id.
  router.get('/me', requireRole('FIELD'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', single: 'month', fill: true }), validate({ query: myPayslipsQuerySchema }), c.mine);
  // HR reads and edits drafts; the Accountant generates, finalizes and pays; Admin does all (decision-log 2026-10-13).
  const office = requireRole('ADMIN', 'HR', 'ACCOUNTANT');
  const hrEdit = requireRole('ADMIN', 'HR');
  const accounts = requireRole('ACCOUNTANT', 'ADMIN');
  router.get('/overview', office, scopeToFinancialYear({ kind: 'month', from: 'month', to: 'month', single: 'month', fill: false }), validate({ query: overviewQuerySchema }), c.overview);
  router.post('/generate', accounts, validate({ body: generateBodySchema }), c.generate);
  router.post('/:id/finalize', accounts, validate({ params: idParamsSchema }), c.finalize);
  router.post('/:id/pay', accounts, validate({ params: idParamsSchema, body: payBodySchema }), c.pay);
  router.post('/:id/days', hrEdit, validate({ params: idParamsSchema, body: overrideDayBodySchema }), c.overrideDay);
  router.post('/:id/adjustments', hrEdit, validate({ params: idParamsSchema, body: adjustAmountBodySchema }), c.adjustAmount);
  router.get('/', office, scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', single: 'month', fill: true }), validate({ query: listRunsQuerySchema }), c.list);
  router.get('/:id', office, validate({ params: idParamsSchema }), c.get);
  return router;
}
