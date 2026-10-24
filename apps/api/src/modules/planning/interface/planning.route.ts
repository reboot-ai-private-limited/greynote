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
  amendMonthlyPlanBodySchema,
  carryOverQuerySchema,
  setDailyPlanDoctorsBodySchema,
  setDailyPlanBodySchema,
  teamSuggestQuerySchema,
  dateRangeQuerySchema,
  grantLateSubmitBodySchema,
  listLateSubmitGrantsQuerySchema,
  listDailyPlansQuerySchema,
  listMonthlyPlansQuerySchema,
  monthRangeQuerySchema,
  planIdParamsSchema,
  userMonthParamsSchema,
  saveMonthlyPlanBodySchema,
} from './planning.schemas.js';

const TAG = 'Planning';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

function doc(
  method: 'get' | 'post' | 'patch' | 'delete',
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

doc('post', '/daily/doctors', 'Set the doctors to call on my plan for a day — also on a day inherited from the monthly plan; missed calls still owed are added', { body: setDailyPlanDoctorsBodySchema });
doc('post', '/daily/plan', 'Change my plan for a day: working type, who I work with and the doctors — while it is a draft, rejected, withdrawn or reopened; routes follow the type (a manager’s follow the people they work with) and remarks stay the monthly plan’s', { body: setDailyPlanBodySchema });
doc('get', '/daily/team-suggest', 'A manager: the routes and doctors of the team members they would work with that day, from those people’s own plans', { query: teamSuggestQuerySchema });
doc('get', '/daily/carry-over', 'Doctors planned on earlier days and not called since — they are owed on this date', { query: carryOverQuerySchema });
doc('get', '/daily', 'My daily plans between two dates, with status and submit deadline', { query: dateRangeQuerySchema });
doc('get', '/daily/{id}', 'One daily plan — owner, their managers (read-only), Admin', { params: planIdParamsSchema });
doc('post', '/daily/{id}/submit', 'Submit my plan for approval — refused after the deadline without a late-submission exception', { params: planIdParamsSchema });
doc('patch', '/daily/{id}/amend', 'Amend an employee’s plan for a day — their managers, HR and Admin; the reason is optional and the old body is kept', { params: planIdParamsSchema, body: amendDailyPlanBodySchema });
doc('post', '/monthly', 'Save my plan for a month — every day at once (draft)', { body: saveMonthlyPlanBodySchema });
doc('get', '/monthly', 'My monthly plans between two months, with status and submit deadline', { query: monthRangeQuerySchema });
doc('get', '/monthly/{id}', 'One monthly plan — owner, their managers (read-only), Admin', { params: planIdParamsSchema });
doc('get', '/users/{userId}/monthly/{month}', 'One employee’s monthly plan for a month (YYYY-MM), 404 when there is none — the employee, their managers (read-only), Admin', { params: userMonthParamsSchema });
doc('get', '/monthly/{id}/routes', 'The active routes of the employee a monthly plan belongs to, named and typed — what a manager editing the plan may choose from; owner, their managers, Admin', { params: planIdParamsSchema });
doc('post', '/monthly/{id}/submit', 'Submit my whole month for approval — refused after the deadline without a late-submission exception', { params: planIdParamsSchema });
doc('patch', '/monthly/{id}/amend', 'Amend an employee’s monthly plan while it waits for their manager, or — HR and Admin — after it is approved, for days after today; the reason is optional, the old days are kept and the employee is told', { params: planIdParamsSchema, body: amendMonthlyPlanBodySchema });
doc('delete', '/monthly/{id}', 'Delete an employee’s monthly plan for good, with its approval and its unsent daily plans — Admin only, and only for a month that has not started', { params: planIdParamsSchema });
doc('post', '/late-grants', 'Allow one employee to submit one plan after its deadline — Admin; a manager for their team while LATE_PLAN_GRANT_BY_MANAGER is on', { body: grantLateSubmitBodySchema });
doc('get', '/late-grants', 'Late-submission exceptions, newest first — Admin: all; others: their own and their team’s', { query: listLateSubmitGrantsQuerySchema });
doc('post', '/late-grants/{id}/revoke', 'Revoke an unused late-submission exception — Admin or whoever granted it', { params: planIdParamsSchema });

export function buildPlanningRouter(c: PlanningHandlers): Router {
  const router = Router();
  router.use(authenticate());

  router.post('/daily/doctors', requireRole('FIELD'), validate({ body: setDailyPlanDoctorsBodySchema }), c.setDoctors);
  router.post('/daily/plan', requireRole('FIELD'), validate({ body: setDailyPlanBodySchema }), c.setDay);
  router.get('/daily/team-suggest', requireRole('FIELD'), validate({ query: teamSuggestQuerySchema }), c.teamSuggest);
  router.get('/daily/carry-over', requireRole('FIELD'), validate({ query: carryOverQuerySchema }), c.carryOver);
  router.get('/daily', requireRole('FIELD'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: false }), validate({ query: listDailyPlansQuerySchema }), c.listDaily);
  router.get('/daily/:id', requireRole('FIELD', 'ADMIN', 'HR'), validate({ params: planIdParamsSchema }), c.getDaily);
  router.post('/daily/:id/submit', requireRole('FIELD'), validate({ params: planIdParamsSchema }), c.submitDaily);

  router.patch('/daily/:id/amend', requireRole('FIELD', 'ADMIN', 'HR'), validate({ params: planIdParamsSchema, body: amendDailyPlanBodySchema }), c.amendDaily);


  router.post('/monthly', requireRole('FIELD'), validate({ body: saveMonthlyPlanBodySchema }), c.saveMonthly);
  router.get('/monthly', requireRole('FIELD'), scopeToFinancialYear({ kind: 'month', from: 'from', to: 'to', fill: true }), validate({ query: listMonthlyPlansQuerySchema }), c.listMonthly);
  router.get('/monthly/:id', requireRole('FIELD', 'ADMIN', 'HR'), validate({ params: planIdParamsSchema }), c.getMonthly);
  router.get('/users/:userId/monthly/:month', requireRole('FIELD', 'ADMIN', 'HR'), validate({ params: userMonthParamsSchema }), c.getUserMonthly);
  router.get('/monthly/:id/routes', requireRole('FIELD', 'ADMIN', 'HR'), validate({ params: planIdParamsSchema }), c.planOwnerRoutes);
  router.post('/monthly/:id/submit', requireRole('FIELD'), validate({ params: planIdParamsSchema }), c.submitMonthly);
  router.patch('/monthly/:id/amend', requireRole('FIELD', 'ADMIN', 'HR'), validate({ params: planIdParamsSchema, body: amendMonthlyPlanBodySchema }), c.amendMonthly);

  router.delete('/monthly/:id', requireRole('ADMIN'), validate({ params: planIdParamsSchema }), c.deleteMonthly);

  // Role checks beyond these (the manager switch, the team) are in the use cases.
  router.post('/late-grants', requireRole('FIELD', 'ADMIN'), validate({ body: grantLateSubmitBodySchema }), c.grantLate);
  router.get('/late-grants', requireRole('FIELD', 'ADMIN'), validate({ query: listLateSubmitGrantsQuerySchema }), c.listLateGrants);
  router.post('/late-grants/:id/revoke', requireRole('FIELD', 'ADMIN'), validate({ params: planIdParamsSchema }), c.revokeLate);
  return router;
}
