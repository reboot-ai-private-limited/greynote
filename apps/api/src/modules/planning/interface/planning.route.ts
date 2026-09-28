import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { PlanningHandlers } from './planning.controller.js';
import {
  dateRangeQuerySchema,
  listDailyPlansQuerySchema,
  listMonthlyPlansQuerySchema,
  monthRangeQuerySchema,
  planIdParamsSchema,
  saveDailyPlanBodySchema,
  saveMonthlyPlanBodySchema,
} from './planning.schemas.js';

const TAG = 'Planning';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

function doc(
  method: 'get' | 'post',
  path: string,
  summary: string,
  request: { query?: AnyZodObject; params?: AnyZodObject; body?: ZodTypeAny },
): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/planning${path}`,
    tags: [TAG],
    summary,
    security: bearer,
    request: {
      ...(request.query && { query: request.query }),
      ...(request.params && { params: request.params }),
      ...(request.body && { body: json(request.body) }),
    },
    responses: { 200: { description: 'OK' } },
  });
}

doc('post', '/daily', 'Save my plan for a day (draft; editable again after a rejection, withdrawal or reopen)', { body: saveDailyPlanBodySchema });
doc('get', '/daily', 'My daily plans between two dates, with status and submit deadline', { query: dateRangeQuerySchema });
doc('get', '/daily/{id}', 'One daily plan — owner, their managers (read-only), Admin', { params: planIdParamsSchema });
doc('post', '/daily/{id}/submit', 'Submit my plan for approval — refused after the deadline without a late-submission exception', { params: planIdParamsSchema });
doc('post', '/monthly', 'Save my plan for a month — every day at once (draft)', { body: saveMonthlyPlanBodySchema });
doc('get', '/monthly', 'My monthly plans between two months, with status and submit deadline', { query: monthRangeQuerySchema });
doc('get', '/monthly/{id}', 'One monthly plan — owner, their managers (read-only), Admin', { params: planIdParamsSchema });
doc('post', '/monthly/{id}/submit', 'Submit my whole month for approval — refused after the deadline without a late-submission exception', { params: planIdParamsSchema });

export function buildPlanningRouter(c: PlanningHandlers): Router {
  const router = Router();
  router.use(authenticate());

  router.post('/daily', requireRole('FIELD'), validate({ body: saveDailyPlanBodySchema }), c.saveDaily);
  router.get('/daily', requireRole('FIELD'), validate({ query: listDailyPlansQuerySchema }), c.listDaily);
  router.get('/daily/:id', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema }), c.getDaily);
  router.post('/daily/:id/submit', requireRole('FIELD'), validate({ params: planIdParamsSchema }), c.submitDaily);

  router.post('/monthly', requireRole('FIELD'), validate({ body: saveMonthlyPlanBodySchema }), c.saveMonthly);
  router.get('/monthly', requireRole('FIELD'), validate({ query: listMonthlyPlansQuerySchema }), c.listMonthly);
  router.get('/monthly/:id', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema }), c.getMonthly);
  router.post('/monthly/:id/submit', requireRole('FIELD'), validate({ params: planIdParamsSchema }), c.submitMonthly);
  return router;
}
