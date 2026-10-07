import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { makeReportsControllers } from './reports.controller.js';
import { orderIdParamsSchema, ordersQuerySchema } from './reports.schemas.js';

const tags = ['Reports'];
const security = [{ bearerAuth: [] }];
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/orders', tags, summary: 'Admin: a month of orders (by order date) with names and totals by status', security, request: { query: ordersQuerySchema }, responses: { 200: { description: 'The orders' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/orders/{id}', tags, summary: 'Admin: one order in full, with product names', security, request: { params: orderIdParamsSchema }, responses: { 200: { description: 'The order' } } });

/** Every report is Admin only for now (sign-off K24) and read-only. */
export function buildReportsRouter(c: ReturnType<typeof makeReportsControllers>): Router {
  const router = Router();
  router.use(authenticate(), requireRole('ADMIN'));
  router.get('/orders', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: ordersQuerySchema }), c.orders);
  router.get('/orders/:id', validate({ params: orderIdParamsSchema }), c.order);
  return router;
}
