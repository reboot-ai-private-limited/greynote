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
  resetPasswordBodySchema,
  unblockUserBodySchema,
  updateUserBodySchema,
  userIdParamsSchema,
} from './users.schemas.js';
import { photoUpload } from './photoUpload.middleware.js';
import type {
  makeCreateUserController,
  makeGetUserDetailController,
  makeGetReportingLineController,
  makeListUsersController,
  makeRemoveEmployeePhotoController,
  makeRemoveUserDocumentController,
  makeSetEmployeePhotoController,
  makeResetPasswordController,
  makeAnonymiseUserController,
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
  tags: ['Identity / Users'],
  summary: 'List/search users',
  security: [{ bearerAuth: [] }],
  request: { query: listUsersQuerySchema },
  responses: { 200: { description: 'Paginated user list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/users',
  tags: ['Identity / Users'],
  summary: 'Create a user (FIELD onboarding, or ADMIN/HR/ACCOUNTANT "user master")',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createUserBodySchema } } } },
  responses: { 201: { description: 'User created' }, 409: { description: 'Duplicate employee code/email' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/users/{id}',
  tags: ['Identity / Users'],
  summary: 'Full user detail — account + onboarding profile + current compliance block, if any',
  security: [{ bearerAuth: [] }],
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'User detail' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/identity/users/{id}',
  tags: ['Identity / Users'],
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
  tags: ['Identity / Users'],
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
  method: 'get',
  path: '/api/identity/users/{id}/reporting',
  tags: ['Identity / Users'],
  summary: "Admin/HR: an employee's reporting line — managers above (nearest first) and everyone below with depth",
  security: [{ bearerAuth: [] }],
  request: { params: userIdParamsSchema },
  responses: { 200: { description: '{ upline, downline }' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/identity/users/{id}/documents/{documentId}',
  tags: ['Identity / Users'],
  summary: 'Remove a document from Cloudinary and the user record',
  security: [{ bearerAuth: [] }],
  request: { params: documentParamsSchema },
  responses: { 200: { description: 'Document removed' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/users/{id}/unblock',
  tags: ['Identity / Users'],
  summary: 'Admin, or a manager above the employee: clear a compliance block — a reason is required and kept as the audit trail',
  security: [{ bearerAuth: [] }],
  request: { params: userIdParamsSchema, body: { content: { 'application/json': { schema: unblockUserBodySchema } } } },
  responses: { 200: { description: 'Block cleared' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/users/{id}/reset-password',
  tags: ['Identity / Users'],
  summary: "Admin: set a user's new password and end all their sessions",
  security: [{ bearerAuth: [] }],
  request: {
    params: userIdParamsSchema,
    body: { content: { 'application/json': { schema: resetPasswordBodySchema } } },
  },
  responses: { 200: { description: 'Password reset' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/users/{id}/anonymise',
  tags: ['Identity / Users'],
  summary: "Admin/HR: delete a FIELD employee's account on their request — personal data removed, records kept",
  security: [{ bearerAuth: [] }],
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'Account deleted' }, 409: { description: 'Already deleted, or still has active reports' } },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/api/identity/users/{id}/photo',
  tags: ['Identity / Users'],
  summary: 'Admin/HR: set or replace an employee photo (multipart `file`, JPG/PNG/WebP, 5 MB); the old one is deleted from Cloudinary',
  security: [{ bearerAuth: [] }],
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'Photo saved; returns photoUrl' } },
});
openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/identity/users/{id}/photo',
  tags: ['Identity / Users'],
  summary: 'Admin/HR: remove an employee photo (deleted from Cloudinary)',
  security: [{ bearerAuth: [] }],
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'Photo removed' } },
});

export function buildUsersRouter(controllers: {
  list: ReturnType<typeof makeListUsersController>;
  detail: ReturnType<typeof makeGetUserDetailController>;
  reporting: ReturnType<typeof makeGetReportingLineController>;
  create: ReturnType<typeof makeCreateUserController>;
  update: ReturnType<typeof makeUpdateUserController>;
  uploadDocument: ReturnType<typeof makeUploadUserDocumentController>;
  removeDocument: ReturnType<typeof makeRemoveUserDocumentController>;
  setPhoto: ReturnType<typeof makeSetEmployeePhotoController>;
  removePhoto: ReturnType<typeof makeRemoveEmployeePhotoController>;
  unblock: ReturnType<typeof makeUnblockUserController>;
  resetPassword: ReturnType<typeof makeResetPasswordController>;
  anonymise: ReturnType<typeof makeAnonymiseUserController>;
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
  router.get(
    '/:id/reporting',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: userIdParamsSchema }),
    controllers.reporting,
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
  router.put(
    '/:id/photo',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: userIdParamsSchema }),
    photoUpload,
    controllers.setPhoto,
  );
  router.delete(
    '/:id/photo',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: userIdParamsSchema }),
    controllers.removePhoto,
  );
  router.post(
    '/:id/unblock',
    authenticate(),
    requireRole('ADMIN', 'FIELD'),
    validate({ params: userIdParamsSchema, body: unblockUserBodySchema }),
    controllers.unblock,
  );
  router.post(
    '/:id/reset-password',
    authenticate(),
    requireRole('ADMIN'),
    validate({ params: userIdParamsSchema, body: resetPasswordBodySchema }),
    controllers.resetPassword,
  );
  router.post(
    '/:id/anonymise',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: userIdParamsSchema }),
    controllers.anonymise,
  );

  return router;
}
