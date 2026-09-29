import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { SyncHandlers } from './sync.controller.js';
import { pushBodySchema } from './sync.schemas.js';

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/sync/push',
  tags: ['Sync'],
  summary: 'Submit the daily report: apply the day’s records once each, in dependency order, with a result per record',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: pushBodySchema } } } },
  responses: { 200: { description: 'One result per record — SYNCED, ALREADY_SYNCED or FAILED (with a reason)' } },
});

export function buildSyncRouter(c: SyncHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.post('/push', requireRole('FIELD'), validate({ body: pushBodySchema }), c.push);
  return router;
}
