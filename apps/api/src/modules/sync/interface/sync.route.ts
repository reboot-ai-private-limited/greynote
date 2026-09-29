import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { SyncHandlers } from './sync.controller.js';
import { listDraftsQuerySchema, pushBodySchema, putDraftsBodySchema } from './sync.schemas.js';

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/sync/push',
  tags: ['Sync'],
  summary: 'Submit the daily report: apply the day’s records once each, in dependency order, with a result per record',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: pushBodySchema } } } },
  responses: { 200: { description: 'One result per record — SYNCED, ALREADY_SYNCED or FAILED (with a reason)' } },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/api/sync/drafts',
  tags: ['Sync'],
  summary: 'Back up the day’s unsent records — private, unvalidated, last write wins; a removal is `deleted: true`',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: putDraftsBodySchema } } } },
  responses: { 200: { description: 'One result per draft — STORED, STALE, SUBMITTED or REJECTED' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/sync/drafts',
  tags: ['Sync'],
  summary: 'Restore my unsent records, e.g. on a new phone — paged',
  security: [{ bearerAuth: [] }],
  request: { query: listDraftsQuerySchema },
  responses: { 200: { description: 'The drafts and a cursor for the next page' } },
});

export function buildSyncRouter(c: SyncHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.put('/drafts', requireRole('FIELD'), validate({ body: putDraftsBodySchema }), c.putDrafts);
  router.get('/drafts', requireRole('FIELD'), validate({ query: listDraftsQuerySchema }), c.listDrafts);
  router.post('/push', requireRole('FIELD'), validate({ body: pushBodySchema }), c.push);
  return router;
}
