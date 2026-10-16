import { Router, type RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { GetUserHqUseCase } from '../application/usecases/getUserHq.usecase.js';
import type { SetUserHqUseCase } from '../application/usecases/setUserHq.usecase.js';
import { setUserHqBodySchema, userIdParamsSchema } from './territory.schemas.js';

const TAG = 'Territory / Employee HQ';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

openApiRegistry.registerPath({
  method: 'put',
  path: '/api/territory/users/{userId}/hq',
  tags: [TAG],
  summary: 'Admin/HR: set a field employee’s HQ (ends the previous one)',
  security: bearer,
  request: { params: userIdParamsSchema, body: json(setUserHqBodySchema) },
  responses: { 200: { description: 'HQ set' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/users/{userId}/hq',
  tags: [TAG],
  summary: 'Admin/HR: an employee’s HQ history, current first',
  security: bearer,
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'HQ assignments' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/users/{userId}/routes',
  tags: [TAG],
  summary: 'Admin/HR: the active routes an employee covers',
  security: bearer,
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'Routes with HQ name, type and distance' } },
});

export function buildUserHqRouter(useCases: { set: SetUserHqUseCase; get: GetUserHqUseCase; routes: RequestHandler }): Router {
  const set: RequestHandler = asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    const assignment = await useCases.set.execute(requiredParam(req.params, 'userId'), req.body.hqId, req.user.sub);
    sendSuccess(req, res, assignment, 'Employee HQ set.', 200);
  });
  const get: RequestHandler = asyncHandler(async (req, res) => {
    sendSuccess(req, res, await useCases.get.history(requiredParam(req.params, 'userId')), 'Employee HQ history.', 200);
  });

  const router = Router();
  router.use(authenticate(), requireRole('ADMIN', 'HR'));
  router.put('/:userId/hq', validate({ params: userIdParamsSchema, body: setUserHqBodySchema }), set);
  router.get('/:userId/hq', validate({ params: userIdParamsSchema }), get);
  router.get('/:userId/routes', validate({ params: userIdParamsSchema }), useCases.routes);
  return router;
}
