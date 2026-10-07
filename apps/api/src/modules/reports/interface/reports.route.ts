import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { makeReportsControllers } from './reports.controller.js';
import { orderIdParamsSchema, ordersQuerySchema, salesStatementQuerySchema, salesYearQuerySchema, stockQuerySchema } from './reports.schemas.js';

const tags = ['Reports'];
const security = [{ bearerAuth: [] }];
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/orders', tags, summary: 'Admin: a month of orders (by order date) with names and totals by status', security, request: { query: ordersQuerySchema }, responses: { 200: { description: 'The orders' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/orders/{id}', tags, summary: 'Admin: one order in full, with product names', security, request: { params: orderIdParamsSchema }, responses: { 200: { description: 'The order' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/reports/sales', tags, summary: 'Admin: primary and secondary sales for each month of a financial year (the chart)', security, request: { query: salesYearQuerySchema }, responses: { 200: { description: 'Twelve months' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/sales/statement', tags, summary: 'Admin: one month\'s stock and sales statement per distributor and product', security, request: { query: salesStatementQuerySchema }, responses: { 200: { description: 'The statement' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/reports/stock', tags, summary: 'Admin: a month\'s stock counts of distributors and chemists, with who has not counted and what does not add up', security, request: { query: stockQuerySchema }, responses: { 200: { description: 'The stock report' } } });

/** Every report is Admin only for now (sign-off K24) and read-only. */
export function buildReportsRouter(c: ReturnType<typeof makeReportsControllers>): Router {
  const router = Router();
  router.use(authenticate(), requireRole('ADMIN'));
  router.get('/orders', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: ordersQuerySchema }), c.orders);
  router.get('/sales', scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ query: salesYearQuerySchema }), c.salesYear);
  router.get('/sales/statement', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: salesStatementQuerySchema }), c.salesStatement);
  router.get('/stock', scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: stockQuerySchema }), c.stock);
  router.get('/orders/:id', validate({ params: orderIdParamsSchema }), c.order);
  return router;
}
