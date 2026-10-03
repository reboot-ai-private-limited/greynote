import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { PlanningHandlers } from './planning.controller.js';
import {
  amendDailyPlanBodySchema,
  dateRangeQuerySchema,
  grantLateSubmitBodySchema,
  listLateSubmitGrantsQuerySchema,
  listDailyPlansQuerySchema,
  listMonthlyPlansQuerySchema,
  monthRangeQuerySchema,
  planIdParamsSchema,
  requestDailyPlanChangeBodySchema,
  saveDailyPlanBodySchema,
  saveMonthlyPlanBodySchema,
} from './planning.schemas.js';

const TAG = 'Planning';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

function doc(
  method: 'get' | 'post' | 'patch',
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
doc('post', '/daily/{id}/changes', 'Ask to change my approved plan for today — goes to my manager; the plan stays approved until they say yes', { params: planIdParamsSchema, body: requestDailyPlanChangeBodySchema });
doc('patch', '/daily/{id}/amend', 'Amend an employee’s plan for a day — their managers and Admin; a reason is required and the old body is kept', { params: planIdParamsSchema, body: amendDailyPlanBodySchema });
doc('get', '/daily/{id}/changes', 'A plan’s in-day changes, with their approval status — owner, their managers (read-only), Admin', { params: planIdParamsSchema });
doc('get', '/changes/{id}', 'One in-day change by its own id — what an approval request points at; owner, their managers (read-only), Admin', { params: planIdParamsSchema });
doc('post', '/monthly', 'Save my plan for a month — every day at once (draft)', { body: saveMonthlyPlanBodySchema });
doc('get', '/monthly', 'My monthly plans between two months, with status and submit deadline', { query: monthRangeQuerySchema });
doc('get', '/monthly/{id}', 'One monthly plan — owner, their managers (read-only), Admin', { params: planIdParamsSchema });
doc('post', '/monthly/{id}/submit', 'Submit my whole month for approval — refused after the deadline without a late-submission exception', { params: planIdParamsSchema });
doc('post', '/late-grants', 'Allow one employee to submit one plan after its deadline — Admin; a manager for their team while LATE_PLAN_GRANT_BY_MANAGER is on', { body: grantLateSubmitBodySchema });
doc('get', '/late-grants', 'Late-submission exceptions, newest first — Admin: all; others: their own and their team’s', { query: listLateSubmitGrantsQuerySchema });
doc('post', '/late-grants/{id}/revoke', 'Revoke an unused late-submission exception — Admin or whoever granted it', { params: planIdParamsSchema });

export function buildPlanningRouter(c: PlanningHandlers): Router {
  const router = Router();
  router.use(authenticate());

  router.post('/daily', requireRole('FIELD'), validate({ body: saveDailyPlanBodySchema }), c.saveDaily);
  router.get('/daily', requireRole('FIELD'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: false }), validate({ query: listDailyPlansQuerySchema }), c.listDaily);
  router.get('/daily/:id', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema }), c.getDaily);
  router.post('/daily/:id/submit', requireRole('FIELD'), validate({ params: planIdParamsSchema }), c.submitDaily);

  router.post('/daily/:id/changes', requireRole('FIELD'), validate({ params: planIdParamsSchema, body: requestDailyPlanChangeBodySchema }), c.requestChange);
  router.patch('/daily/:id/amend', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema, body: amendDailyPlanBodySchema }), c.amendDaily);
  router.get('/daily/:id/changes', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema }), c.listChanges);

  router.get('/changes/:id', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema }), c.getChange);

  router.post('/monthly', requireRole('FIELD'), validate({ body: saveMonthlyPlanBodySchema }), c.saveMonthly);
  router.get('/monthly', requireRole('FIELD'), scopeToFinancialYear({ kind: 'month', from: 'from', to: 'to', fill: true }), validate({ query: listMonthlyPlansQuerySchema }), c.listMonthly);
  router.get('/monthly/:id', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema }), c.getMonthly);
  router.post('/monthly/:id/submit', requireRole('FIELD'), validate({ params: planIdParamsSchema }), c.submitMonthly);

  // Role checks beyond these (the manager switch, the team) are in the use cases.
  router.post('/late-grants', requireRole('FIELD', 'ADMIN'), validate({ body: grantLateSubmitBodySchema }), c.grantLate);
  router.get('/late-grants', requireRole('FIELD', 'ADMIN'), validate({ query: listLateSubmitGrantsQuerySchema }), c.listLateGrants);
  router.post('/late-grants/:id/revoke', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema }), c.revokeLate);
  return router;
}
