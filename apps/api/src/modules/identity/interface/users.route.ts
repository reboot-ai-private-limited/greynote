import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { AppError } from '@/shared/errors/AppError.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import {
  createUserBodySchema,
  documentParamsSchema,
  documentTypeBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamsSchema,
} from './users.schemas.js';
import type {
  makeCreateUserController,
  makeGetUserDetailController,
  makeListUsersController,
  makeRemoveUserDocumentController,
  makeUnblockUserController,
  makeUpdateUserController,
  makeUploadUserDocumentController,
} from './users.controller.js';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES } }).single(
  'file',
);

/** Converts multer's error-first callback (a bad file/size) into the same AppError path everything else uses. */
function uploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (err) {
      next(AppError.badRequest(err instanceof Error ? err.message : 'Invalid file upload.'));
      return;
    }
    next();
  });
}

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/users',
  summary: 'List/search users',
  security: [{ bearerAuth: [] }],
  request: { query: listUsersQuerySchema },
  responses: { 200: { description: 'Paginated user list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/users',
  summary: 'Create a user (FIELD onboarding, or ADMIN/HR/ACCOUNTANT "user master")',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createUserBodySchema } } } },
  responses: { 201: { description: 'User created' }, 409: { description: 'Duplicate employee code/email' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/users/{id}',
  summary: 'Full user detail — account + onboarding profile + current compliance block, if any',
  security: [{ bearerAuth: [] }],
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'User detail' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/identity/users/{id}',
  summary: 'Incremental onboarding update (basic details, bank details, designation, pay band, manager)',
  security: [{ bearerAuth: [] }],
  request: {
    params: userIdParamsSchema,
    body: { content: { 'application/json': { schema: updateUserBodySchema } } },
  },
  responses: { 200: { description: 'User updated, status recomputed' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/users/{id}/documents',
  summary: 'Upload a document to Cloudinary and attach it to the user',
  security: [{ bearerAuth: [] }],
  request: {
    params: userIdParamsSchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }), documentType: z.string() }),
        },
      },
    },
  },
  responses: { 201: { description: 'Document uploaded' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/identity/users/{id}/documents/{documentId}',
  summary: 'Remove a document from Cloudinary and the user record',
  security: [{ bearerAuth: [] }],
  request: { params: documentParamsSchema },
  responses: { 200: { description: 'Document removed' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/users/{id}/unblock',
  summary: 'Admin: clear a compliance block',
  security: [{ bearerAuth: [] }],
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'Block cleared' } },
});

export function buildUsersRouter(controllers: {
  list: ReturnType<typeof makeListUsersController>;
  detail: ReturnType<typeof makeGetUserDetailController>;
  create: ReturnType<typeof makeCreateUserController>;
  update: ReturnType<typeof makeUpdateUserController>;
  uploadDocument: ReturnType<typeof makeUploadUserDocumentController>;
  removeDocument: ReturnType<typeof makeRemoveUserDocumentController>;
  unblock: ReturnType<typeof makeUnblockUserController>;
}): Router {
  const router = Router();

  router.get(
    '/',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ query: listUsersQuerySchema }),
    controllers.list,
  );
  router.get(
    '/:id',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: userIdParamsSchema }),
    controllers.detail,
  );
  router.post(
    '/',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ body: createUserBodySchema }),
    controllers.create,
  );
  router.patch(
    '/:id',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: userIdParamsSchema, body: updateUserBodySchema }),
    controllers.update,
  );
  router.post(
    '/:id/documents',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: userIdParamsSchema }),
    uploadMiddleware,
    validate({ body: documentTypeBodySchema }),
    controllers.uploadDocument,
  );
  router.delete(
    '/:id/documents/:documentId',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: documentParamsSchema }),
    controllers.removeDocument,
  );
  router.post(
    '/:id/unblock',
    authenticate(),
    requireRole('ADMIN'),
    validate({ params: userIdParamsSchema }),
    controllers.unblock,
  );

  return router;
}
