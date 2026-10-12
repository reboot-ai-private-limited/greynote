import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { InboxHandlers } from './inbox.controller.js';
import { idParamsSchema, myInboxQuerySchema, publishBodySchema, sentQuerySchema } from './inbox.schemas.js';

const TAG = 'Inbox';
const bearer = [{ bearerAuth: [] }];

function doc(method: 'get' | 'post' | 'delete', path: string, summary: string, request: { query?: AnyZodObject; params?: AnyZodObject; body?: ZodTypeAny } = {}): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/inbox${path}`,
    tags: [TAG],
    summary,
    security: bearer,
    request: {
      ...(request.query && { query: request.query }),
      ...(request.params && { params: request.params }),
      ...(request.body && { body: { content: { 'application/json': { schema: request.body } } } }),
    },
    responses: { 200: { description: 'OK' } },
  });
}

doc('get', '/', 'My inbox, newest first (expired and taken-back messages are gone); ?unread=true for unread only', { query: myInboxQuerySchema });
doc('get', '/unread-count', 'How many unread messages I have — the badge');
doc('post', '/read-all', 'Mark every message in my inbox as read');
doc('post', '/{id}/read', 'Mark one message as read (the id is the message id)', { params: idParamsSchema });
doc('post', '/messages', 'Admin: send a message to an audience (everyone, or any mix of roles, Zones, HQs and people)', { body: publishBodySchema });
doc('get', '/messages', 'Admin: messages sent, newest first, with how many recipients opened each', { query: sentQuerySchema });
doc('delete', '/messages/{id}', 'Admin: take a message back — recipients stop seeing it', { params: idParamsSchema });

export function buildInboxRouter(c: InboxHandlers): Router {
  const router = Router();
  router.use(authenticate());
  const admin = requireRole('ADMIN');

  // The Admin's side is declared first so `/messages` is never read as an `/:id`.
  router.post('/messages', admin, validate({ body: publishBodySchema }), c.publish);
  router.get('/messages', admin, validate({ query: sentQuerySchema }), c.listSent);
  router.delete('/messages/:id', admin, validate({ params: idParamsSchema }), c.retract);

  router.get('/', validate({ query: myInboxQuerySchema }), c.list);
  router.get('/unread-count', c.unreadCount);
  router.post('/read-all', c.markAllRead);
  router.post('/:id/read', validate({ params: idParamsSchema }), c.markRead);
  return router;
}
