import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { SalesHandlers } from './sales.controller.js';
import { listMonthlyStockQuerySchema, missingQuerySchema, monthlyStockBodySchema, unlockBodySchema } from './sales.schemas.js';

const TAG = 'Sales';

function doc(method: 'get' | 'post', path: string, summary: string, request: { query?: ZodTypeAny; body?: ZodTypeAny }): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/sales${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { ...(request.query && { query: request.query as AnyZodObject }), ...(request.body && { body: { content: { 'application/json': { schema: request.body } } } }) },
    responses: { 200: { description: 'OK' }, 409: { description: 'The month is closed or has not started' } },
  });
}
doc('post', '/monthly-stock', 'Save one outlet’s opening and closing stock for a month, several products at once — due by the month’s last day; an MR for their own Chemists and Distributors, Admin for any', { body: monthlyStockBodySchema });
doc('get', '/monthly-stock', 'Stock counts for my outlets — a manager also sees their downline’s, Admin all', { query: listMonthlyStockQuerySchema });
doc('post', '/monthly-stock/unlock', 'Admin: reopen a month after its deadline', { body: unlockBodySchema });
doc('get', '/monthly-stock/missing', 'Outlets with no stock count for a month, by MR — a manager’s downline, or everyone for Admin', { query: missingQuerySchema });

export function buildSalesRouter(c: SalesHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.post('/monthly-stock', requireRole('FIELD', 'ADMIN'), validate({ body: monthlyStockBodySchema }), c.recordStock);
  router.get('/monthly-stock', requireRole('FIELD', 'ADMIN'), validate({ query: listMonthlyStockQuerySchema }), c.listStock);
  router.post('/monthly-stock/unlock', requireRole('ADMIN'), validate({ body: unlockBodySchema }), c.unlockMonth);
  router.get('/monthly-stock/missing', requireRole('FIELD', 'ADMIN'), validate({ query: missingQuerySchema }), c.missingStock);
  return router;
}
