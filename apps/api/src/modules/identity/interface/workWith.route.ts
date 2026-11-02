import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { ListWorkWithUseCase } from '../application/usecases/listWorkWith.usecase.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/work-with',
  tags: ['Identity / Work With'],
  summary:
    'People a field employee can name as "Work With": the managers above them and everyone below them in their own reporting tree, active only. Each row carries a label like "Name (ASM)".',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Work-with candidates, sorted by name' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/work-with/directory',
  tags: ['Identity / Work With'],
  summary: 'Admin, HR, Accountant: every active field employee as id, name, code and designation only — for the pickers on screens (such as the distributor form) the Accountant uses without seeing employee records.',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Active field employees, sorted by name' } },
});

export function buildWorkWithRouter(useCase: ListWorkWithUseCase): Router {
  const router = Router();
  router.get(
    '/directory',
    authenticate(),
    requireRole('ADMIN', 'HR', 'ACCOUNTANT'),
    asyncHandler(async (req, res) => sendSuccess(req, res, await useCase.executeDirectory(), 'Field employees fetched.', 200)),
  );
  router.get(
    '/',
    authenticate(),
    requireRole('FIELD'),
    asyncHandler(async (req, res) => {
      if (!req.user) throw AppError.unauthenticated();
      sendSuccess(req, res, await useCase.execute(req.user.sub), 'Work-with list fetched.', 200);
    }),
  );
  return router;
}
