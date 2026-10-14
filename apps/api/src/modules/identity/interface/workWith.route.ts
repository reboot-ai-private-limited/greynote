import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { ListWorkWithUseCase } from '../application/usecases/listWorkWith.usecase.js';

export const workWithQuerySchema = z.object({
  scope: z.enum(['managers', 'all']).default('managers'),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/work-with',
  tags: ['Identity / Work With'],
  summary:
    'People a field employee can name as "Work With": every active manager in the organisation (default), or with ?scope=all every active field employee. Each row carries a label like "Name (ASM)".',
  security: [{ bearerAuth: [] }],
  request: { query: workWithQuerySchema },
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
    asyncHandler(async (req, res) => sendSuccess(req, res, await useCase.execute('', 'all'), 'Field employees fetched.', 200)),
  );
  router.get(
    '/',
    authenticate(),
    requireRole('FIELD'),
    validate({ query: workWithQuerySchema }),
    asyncHandler(async (req, res) => {
      if (!req.user) throw AppError.unauthenticated();
      const { scope } = req.query as unknown as z.infer<typeof workWithQuerySchema>;
      sendSuccess(req, res, await useCase.execute(req.user.sub, scope), 'Work-with list fetched.', 200);
    }),
  );
  return router;
}
