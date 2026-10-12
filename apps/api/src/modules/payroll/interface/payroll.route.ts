import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { PayrollHandlers } from './payroll.controller.js';
import { generateBodySchema, idParamsSchema, listRunsQuerySchema, myPayslipsQuerySchema } from './payroll.schemas.js';

const TAG = 'Payroll';

function doc(method: 'get' | 'post', path: string, summary: string, request: { query?: ZodTypeAny; body?: ZodTypeAny; params?: AnyZodObject } = {}): void {
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
doc('get', '/me', 'Field employee: my own finalized payslips, for the financial year in view (X-Financial-Year), or a month range inside it', { query: myPayslipsQuerySchema });
doc('get', '/{id}', 'One payroll run', { params: idParamsSchema });
doc('get', '/', 'Payroll runs, filterable by month, employee and status', { query: listRunsQuerySchema });

export function buildPayrollRouter(c: PayrollHandlers): Router {
  const router = Router();
  router.use(authenticate());
  // The employee's own slips come first so `me` is never read as an id.
  router.get('/me', requireRole('FIELD'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', single: 'month', fill: true }), validate({ query: myPayslipsQuerySchema }), c.mine);
  router.use(requireRole('ACCOUNTANT', 'ADMIN'));
  router.post('/generate', validate({ body: generateBodySchema }), c.generate);
  router.post('/:id/finalize', validate({ params: idParamsSchema }), c.finalize);
  router.get('/', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', single: 'month', fill: true }), validate({ query: listRunsQuerySchema }), c.list);
  router.get('/:id', validate({ params: idParamsSchema }), c.get);
  return router;
}
