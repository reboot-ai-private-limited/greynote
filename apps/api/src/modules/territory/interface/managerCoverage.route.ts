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
import type { ListManagerCandidatesUseCase } from '../application/usecases/listManagerCandidates.usecase.js';
import type { GetTerritoryGapsUseCase } from '../application/usecases/getTerritoryGaps.usecase.js';
import type { ExtendManagerTerritoryUseCase } from '../application/usecases/extendManagerTerritory.usecase.js';
import type { GetManagerCoverageUseCase, SetManagerCoverageUseCase } from '../application/usecases/managerCoverage.usecase.js';
import { extendManagerTerritoryBodySchema, managerCandidatesQuerySchema, setManagerCoverageBodySchema, userIdParamsSchema } from './territory.schemas.js';

const TAG = 'Territory / Manager coverage';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

openApiRegistry.registerPath({
  method: 'put',
  path: '/api/territory/users/{userId}/coverage',
  tags: [TAG],
  summary: 'Admin/HR: set the HQs (ASM, RSM) or Zones (ZSM) a manager covers',
  security: bearer,
  request: { params: userIdParamsSchema, body: json(setManagerCoverageBodySchema) },
  responses: { 200: { description: 'Coverage saved' } },
});
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/territory/users/{userId}/extend-territory',
  tags: [TAG],
  summary: 'Admin/HR: add Zones, HQs and routes to a manager’s territory (union only), when an employee is put under them',
  security: bearer,
  request: { params: userIdParamsSchema, body: json(extendManagerTerritoryBodySchema) },
  responses: { 200: { description: 'Territory extended' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/users/{userId}/team-gaps',
  tags: [TAG],
  summary: 'Admin/HR: the Zones, HQs and routes a manager’s direct reports have that the manager does not',
  security: bearer,
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'The manager’s gap' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/team-gaps',
  tags: [TAG],
  summary: 'Admin/HR: every manager whose direct reports have Zones, HQs or routes the manager does not',
  security: bearer,
  responses: { 200: { description: 'Managers with a gap' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/users/{userId}/coverage',
  tags: [TAG],
  summary: 'Admin/HR: the HQs and Zones a manager covers',
  security: bearer,
  request: { params: userIdParamsSchema },
  responses: { 200: { description: 'Coverage' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/manager-candidates',
  tags: [TAG],
  summary: 'Admin/HR/Accountant: who can be an employee’s manager (higher designation, covering their HQ), nearest level first',
  security: bearer,
  request: { query: managerCandidatesQuerySchema },
  responses: { 200: { description: 'Candidates' } },
});

/** Mounted at `/users` (coverage of one manager) and `/manager-candidates`. */
export function buildManagerCoverageRouter(useCases: { get: GetManagerCoverageUseCase; set: SetManagerCoverageUseCase; extend: ExtendManagerTerritoryUseCase; gaps: GetTerritoryGapsUseCase }): Router {
  const get: RequestHandler = asyncHandler(async (req, res) => sendSuccess(req, res, await useCases.get.execute(requiredParam(req.params, 'userId')), 'Manager coverage.', 200));
  const set: RequestHandler = asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    sendSuccess(req, res, await useCases.set.execute(requiredParam(req.params, 'userId'), req.body, req.user.sub), 'Manager coverage saved.', 200);
  });
  const extend: RequestHandler = asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    sendSuccess(req, res, await useCases.extend.execute(requiredParam(req.params, 'userId'), req.body, req.user.sub), 'Territory extended.', 200);
  });
  const gap: RequestHandler = asyncHandler(async (req, res) => sendSuccess(req, res, await useCases.gaps.forManager(requiredParam(req.params, 'userId')), 'Team gaps.', 200));
  const router = Router();
  router.use(authenticate(), requireRole('ADMIN', 'HR'));
  router.get('/:userId/team-gaps', validate({ params: userIdParamsSchema }), gap);
  router.post('/:userId/extend-territory', validate({ params: userIdParamsSchema, body: extendManagerTerritoryBodySchema }), extend);
  router.put('/:userId/coverage', validate({ params: userIdParamsSchema, body: setManagerCoverageBodySchema }), set);
  router.get('/:userId/coverage', validate({ params: userIdParamsSchema }), get);
  return router;
}

export function buildManagerCandidatesRouter(list: ListManagerCandidatesUseCase): Router {
  const handler: RequestHandler = asyncHandler(async (req, res) => {
    const q = req.query as unknown as { level: number; hqId?: string; search?: string; excludeUserId?: string };
    sendSuccess(req, res, await list.execute({ belowLevel: q.level, hqId: q.hqId, search: q.search, excludeUserId: q.excludeUserId }), 'Manager candidates.', 200);
  });
  const router = Router();
  router.use(authenticate(), requireRole('ADMIN', 'HR', 'ACCOUNTANT'));
  router.get('/', validate({ query: managerCandidatesQuerySchema }), handler);
  return router;
}

export function buildTeamGapsRouter(gaps: GetTerritoryGapsUseCase): Router {
  const handler: RequestHandler = asyncHandler(async (req, res) => sendSuccess(req, res, await gaps.all(), 'Managers with a territory gap.', 200));
  const router = Router();
  router.use(authenticate(), requireRole('ADMIN', 'HR'));
  router.get('/', handler);
  return router;
}
