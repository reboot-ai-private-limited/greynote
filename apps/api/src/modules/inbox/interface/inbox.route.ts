import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z, type AnyZodObject, type ZodTypeAny } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { INBOX_ATTACHMENT_MAX_BYTES, INBOX_MAX_ATTACHMENTS } from '../domain/attachment.js';
import type { InboxHandlers } from './inbox.controller.js';
import { idParamsSchema, myInboxQuerySchema, publishBodySchema, sentQuerySchema } from './inbox.schemas.js';

const TAG = 'Inbox';

/** Text fields may be as large as a JSON body (`express.json`'s 2 MB): the message itself has no limit of its own. */
const MAX_FIELD_BYTES = 2 * 1024 * 1024;
const uploadFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INBOX_ATTACHMENT_MAX_BYTES, files: INBOX_MAX_ATTACHMENTS, fieldSize: MAX_FIELD_BYTES },
}).array('files', INBOX_MAX_ATTACHMENTS);

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'An attachment is over 10 MB.',
  LIMIT_FILE_COUNT: `Attach at most ${INBOX_MAX_ATTACHMENTS} files.`,
  LIMIT_UNEXPECTED_FILE: `Attach at most ${INBOX_MAX_ATTACHMENTS} files, in the \`files\` field.`,
  LIMIT_FIELD_VALUE: 'The message is too long to send (over 2 MB of text).',
};

/**
 * A multipart send carries the message as JSON in `payload` beside the `files`; a plain JSON send is left as it is.
 * Either way the body reaching `validate` is the same object.
 */
export function publishUpload(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('multipart/form-data')) return next();
  uploadFiles(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string }).code ?? '';
      return next(AppError.badRequest(MULTER_MESSAGES[code] ?? (err instanceof Error ? err.message : 'Invalid upload.'), { field: 'files' }));
    }
    const payload = (req.body as { payload?: unknown }).payload;
    try {
      req.body = typeof payload === 'string' ? (JSON.parse(payload) as unknown) : undefined;
    } catch {
      req.body = undefined;
    }
    if (req.body === undefined || req.body === null || typeof req.body !== 'object') return next(AppError.badRequest('Send the message as JSON in the `payload` field.', { field: 'payload' }));
    next();
  });
}
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
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/inbox/messages',
  tags: [TAG],
  summary: 'Admin: send a message to an audience (everyone, or any mix of roles, Zones, HQs and people), with files if wanted',
  description:
    `JSON, or multipart/form-data with the same object as JSON in \`payload\` and up to ${INBOX_MAX_ATTACHMENTS} files in \`files\` ` +
    '(PDF, JPG, PNG, WebP, DOCX, XLSX, PPTX; 10 MB each; the type is read from the file). The body has no length limit of its own.',
  security: bearer,
  request: {
    body: {
      content: {
        'application/json': { schema: publishBodySchema },
        'multipart/form-data': { schema: z.object({ payload: z.string(), files: z.array(z.string().openapi({ type: 'string', format: 'binary' })).optional() }) },
      },
    },
  },
  responses: { 201: { description: 'Sent' }, 400: { description: 'Bad audience, file or payload; nothing sent' } },
});
doc('get', '/messages', 'Admin: messages sent, newest first, with how many recipients opened each', { query: sentQuerySchema });
doc('delete', '/messages/{id}', 'Admin: take a message back — recipients stop seeing it', { params: idParamsSchema });

export function buildInboxRouter(c: InboxHandlers): Router {
  const router = Router();
  router.use(authenticate());
  const admin = requireRole('ADMIN');

  // The Admin's side is declared first so `/messages` is never read as an `/:id`.
  router.post('/messages', admin, publishUpload, validate({ body: publishBodySchema }), c.publish);
  router.get('/messages', admin, validate({ query: sentQuerySchema }), c.listSent);
  router.delete('/messages/:id', admin, validate({ params: idParamsSchema }), c.retract);

  router.get('/', validate({ query: myInboxQuerySchema }), c.list);
  router.get('/unread-count', c.unreadCount);
  router.post('/read-all', c.markAllRead);
  router.post('/:id/read', validate({ params: idParamsSchema }), c.markRead);
  return router;
}
