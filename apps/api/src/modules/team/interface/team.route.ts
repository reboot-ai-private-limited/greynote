import { Router } from 'express';
import type { AnyZodObject } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { TeamHandlers } from './team.controller.js';
import {
  leavesQuerySchema,
  memberParamsSchema,
  membersQuerySchema,
  ordersQuerySchema,
  stockQuerySchema,
  dayQuerySchema,
  doctorParamsSchema,
  daysQuerySchema,
  plansQuerySchema,
  summaryQuerySchema,
  todayQuerySchema,
} from './team.schemas.js';

function doc(path: string, summary: string, query: AnyZodObject, params?: AnyZodObject): void {
  openApiRegistry.registerPath({
    method: 'get',
    path: `/api/team${path}`,
    tags: ['Team'],
    summary,
    security: [{ bearerAuth: [] }],
    request: { query, ...(params && { params }) },
    responses: { 200: { description: 'OK' } },
  });
}

doc(
  '/members',
  'Manager: the people below me (direct reports at depth 1, deeper levels read-only), nearest first then by name',
  membersQuerySchema,
);
doc(
  '/members/{id}/summary',
  'Manager: one person of my team — who they are, today, and their month (the Team Overview row); 403 for anyone outside my downline',
  summaryQuerySchema,
  memberParamsSchema,
);
doc(
  '/today',
  'Manager: each active team member’s day — plan, report, leave, blocked — needs-attention first, with tile counts for the whole level',
  todayQuerySchema,
);
doc(
  '/members/{id}/days',
  'Manager: one team member’s month day by day, newest first: the plan (routes and doctors by name, remarks, status) and what happened (the report, which doctors were called)',
  daysQuerySchema,
  memberParamsSchema,
);
doc(
  '/members/{id}/attendance',
  'Manager: one team member’s month, one status per day, for the attendance calendar',
  daysQuerySchema,
  memberParamsSchema,
);
doc(
  '/members/{id}/doctors',
  'Manager: one team member’s doctors with visits this month, the last visit and the services asked for each (amount and stage)',
  daysQuerySchema,
  memberParamsSchema,
);
doc(
  '/doctors/{id}',
  'Manager: one doctor held by someone below me, with how he is visited and every service asked for him',
  daysQuerySchema,
  doctorParamsSchema,
);
doc(
  '/day',
  'Manager: the board for a day (including tomorrow): each member’s routes by name, the doctors the plan lists by name and which were called, other calls, orders and the report',
  dayQuerySchema,
);
doc(
  '/plans',
  'Manager: each active team member’s Daily Plan for a day (including tomorrow) and their Monthly Plan status',
  plansQuerySchema,
);
doc(
  '/leaves',
  'Manager: the team’s leaves (waiting, manager-approved, approved) touching a date window of at most 93 days',
  leavesQuerySchema,
);

export function buildTeamRouter(c: TeamHandlers): Router {
  const router = Router();
  router.use(authenticate(), requireRole('FIELD'));
  router.get('/members', validate({ query: membersQuerySchema }), c.members);
  router.get(
    '/members/:id/summary',
    validate({ params: memberParamsSchema, query: summaryQuerySchema }),
    c.summary,
  );
  router.get('/today', validate({ query: todayQuerySchema }), c.today);
  router.get('/members/:id/days', validate({ params: memberParamsSchema, query: daysQuerySchema }), c.memberDays);
  router.get('/members/:id/attendance', validate({ params: memberParamsSchema, query: daysQuerySchema }), c.memberAttendance);
  router.get('/members/:id/doctors', validate({ params: memberParamsSchema, query: daysQuerySchema }), c.memberDoctors);
  router.get('/doctors/:id', validate({ params: doctorParamsSchema, query: daysQuerySchema }), c.doctor);
  router.get('/day', validate({ query: dayQuerySchema }), c.day);
  router.get('/plans', validate({ query: plansQuerySchema }), c.plans);
  router.get('/orders', validate({ query: ordersQuerySchema }), c.orders);
  router.get('/stock', validate({ query: stockQuerySchema }), c.stock);
  router.get('/leaves', validate({ query: leavesQuerySchema }), c.leaves);
  return router;
}
