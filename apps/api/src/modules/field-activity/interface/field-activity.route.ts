import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { FieldActivityHandlers } from './field-activity.controller.js';
import { callParamsSchema, idParamsSchema, overrideBodySchema, listDcrsQuerySchema, listTeamDcrsQuerySchema } from './field-activity.schemas.js';

const TAG = 'Field Activity';

function doc(path: string, summary: string, request: { query?: ZodTypeAny; params?: AnyZodObject } = {}): void {
  openApiRegistry.registerPath({
    method: 'get',
    path: `/api/field-activity${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { ...(request.query && { query: request.query as AnyZodObject }), ...(request.params && { params: request.params }) },
    responses: { 200: { description: 'OK' } },
  });
}

doc('/dcr', 'My daily reports in a date range — Admin: anyone’s, named by userId', { query: listDcrsQuerySchema });
doc('/dcr/team', 'My downline’s daily reports in a date range, read-only', { query: listTeamDcrsQuerySchema });
doc('/dcr/{id}', 'One daily report — the owner, their managers, Admin', { params: idParamsSchema });
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/field-activity/dcr/{id}/calls/{callId}/override-geofence',
  tags: [TAG],
  summary: 'Accept a call the geofence flagged (FAIL / UNVERIFIED) — the reviewing manager, or Admin; a comment is required',
  security: [{ bearerAuth: [] }],
  request: { params: callParamsSchema, body: { content: { 'application/json': { schema: overrideBodySchema } } } },
  responses: { 200: { description: 'The call, now OVERRIDE' }, 409: { description: 'Not under review, passed, or already accepted' } },
});

/**
 * Reads, plus the geofence override: the day's records arrive through the sync push, and a DCR is approved
 * through `/api/approvals/*` with `kind=DCR` (LLD field-activity.md, *Write path and HTTP surface*).
 */
export function buildFieldActivityRouter(c: FieldActivityHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.get('/dcr', requireRole('FIELD', 'ADMIN'), validate({ query: listDcrsQuerySchema }), c.listDcrs);
  router.get('/dcr/team', requireRole('FIELD'), validate({ query: listTeamDcrsQuerySchema }), c.teamDcrs);
  router.get('/dcr/:id', requireRole('FIELD', 'ADMIN'), validate({ params: idParamsSchema }), c.getDcr);
  router.post('/dcr/:id/calls/:callId/override-geofence', requireRole('FIELD', 'ADMIN'), validate({ params: callParamsSchema, body: overrideBodySchema }), c.overrideGeofence);
  return router;
}
