import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { LateGrantsHandlers } from './lateGrants.controller.js';
import { bulkGrantLateBodySchema, eligibleBaseSchema, eligibleQuerySchema, grantIdParamsSchema, grantLateBodySchema, listLateQuerySchema, previewLateQuerySchema } from './lateGrants.schemas.js';

const TAG = 'Late grants';
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

function doc(method: 'get' | 'post', path: string, summary: string, request: { query?: AnyZodObject; params?: AnyZodObject; body?: ZodTypeAny }): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/late-grants${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { ...(request.query && { query: request.query }), ...(request.params && { params: request.params }), ...(request.body && { body: json(request.body) }) },
    responses: { 200: { description: 'OK' } },
  });
}

doc('get', '/kinds', 'What can be allowed late, and how each period is named', {});
doc('get', '/eligible', 'Employees a bulk exception can be aimed at: everyone active, or one team — Admin; a manager for their own team', { query: eligibleBaseSchema });
doc('post', '/bulk', 'Allow many employees the same late exception at once — each is checked like a single grant; those that cannot be granted are reported, the rest go through', { body: bulkGrantLateBodySchema });
doc('get', '/preview', 'Whether a late entry is still possible for this employee and period — and why not', { query: previewLateQuerySchema });
doc('post', '', 'Allow one employee to do one late thing for one period — Admin; a manager for their team where the kind allows it', { body: grantLateBodySchema });
doc('get', '', 'Late-submission exceptions, newest first — Admin, HR and Accountant: all; a field user: their own and their team’s', { query: listLateQuerySchema });
doc('post', '/{id}/revoke', 'Revoke an unused exception — Admin or whoever granted it', { params: grantIdParamsSchema });

export function buildLateGrantsRouter(c: LateGrantsHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.get('/kinds', requireRole('FIELD', 'ADMIN', 'HR', 'ACCOUNTANT'), c.kinds);
  router.get('/eligible', requireRole('FIELD', 'ADMIN'), validate({ query: eligibleQuerySchema }), c.eligible);
  router.post('/bulk', requireRole('FIELD', 'ADMIN'), validate({ body: bulkGrantLateBodySchema }), c.bulk);
  router.get('/preview', requireRole('FIELD', 'ADMIN'), validate({ query: previewLateQuerySchema }), c.preview);
  router.post('/', requireRole('FIELD', 'ADMIN'), validate({ body: grantLateBodySchema }), c.grant);
  router.get('/', requireRole('FIELD', 'ADMIN', 'HR', 'ACCOUNTANT'), validate({ query: listLateQuerySchema }), c.list);
  router.post('/:id/revoke', requireRole('FIELD', 'ADMIN'), validate({ params: grantIdParamsSchema }), c.revoke);
  return router;
}
