import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { AnyZodObject } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { DocumentsHandlers } from './documents.controller.js';
import { idParamsSchema, uploadBodySchema } from './documents.schemas.js';

const MAX_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } }).single('file');

/** Turns multer's error-first callback (a too-big or malformed file) into the same AppError path everything else uses. */
function uploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => (err ? next(AppError.badRequest(err instanceof Error ? err.message : 'Invalid file upload.')) : next()));
}

function doc(method: 'get' | 'post' | 'delete', path: string, summary: string, params?: AnyZodObject): void {
  openApiRegistry.registerPath({ method, path: `/api/documents${path}`, tags: ['Documents'], summary, security: [{ bearerAuth: [] }], request: { ...(params && { params }) }, responses: { 200: { description: 'OK' } } });
}
doc('get', '/', 'Admin: the whole library. A field employee: the documents for everyone or naming them. Not tied to a financial year');
doc('post', '/', 'Admin: add a document (multipart: file + title, category, optional userIds; PDF/JPG/PNG up to 10 MB). No userIds means every field employee');
doc('delete', '/{id}', 'Admin: remove a document and its file', idParamsSchema);

export function buildDocumentsRouter(c: DocumentsHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.get('/', requireRole('ADMIN', 'FIELD'), c.list);
  router.post('/', requireRole('ADMIN'), uploadMiddleware, validate({ body: uploadBodySchema }), c.upload);
  router.delete('/:id', requireRole('ADMIN'), validate({ params: idParamsSchema }), c.remove);
  return router;
}
