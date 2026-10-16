import { Router, type RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { TerritoryDeletionUseCase } from '../application/usecases/territoryDeletion.usecase.js';
import type { TerritoryKind } from '../domain/territoryDeletion.js';
import { territoryIdParamsSchema } from './territory.schemas.js';

const SEGMENTS: Record<string, { kind: TerritoryKind; noun: string }> = {
  zones: { kind: 'ZONE', noun: 'zone' },
  hqs: { kind: 'HQ', noun: 'HQ' },
  routes: { kind: 'ROUTE', noun: 'route' },
};

for (const [segment, { noun }] of Object.entries(SEGMENTS)) {
  openApiRegistry.registerPath({
    method: 'get',
    path: `/api/territory/${segment}/{id}/delete-impact`,
    tags: ['Territory / Delete'],
    summary: `Admin: what deleting this ${noun} would take and touch`,
    security: [{ bearerAuth: [] }],
    request: { params: territoryIdParamsSchema },
    responses: { 200: { description: 'Counts of what is also deleted, the people touched and the records that point at it' } },
  });
  openApiRegistry.registerPath({
    method: 'delete',
    path: `/api/territory/${segment}/{id}`,
    tags: ['Territory / Delete'],
    summary: `Admin: permanently delete this ${noun} and everything under it`,
    security: [{ bearerAuth: [] }],
    request: { params: territoryIdParamsSchema },
    responses: { 200: { description: 'Deleted' } },
  });
}

/** Mounted at `/territory`, ahead of the level routers, so `DELETE /zones/:id` and the impact preview sit beside their other routes. */
export function buildTerritoryDeletionRouter(useCase: TerritoryDeletionUseCase): Router {
  const kindOf = (req: Parameters<RequestHandler>[0]): TerritoryKind => {
    const found = SEGMENTS[req.path.split('/')[1] ?? ''];
    if (!found) throw AppError.notFound();
    return found.kind;
  };
  const impact: RequestHandler = asyncHandler(async (req, res) =>
    sendSuccess(req, res, await useCase.impact(kindOf(req), requiredParam(req.params, 'id')), 'Delete impact.', 200),
  );
  const remove: RequestHandler = asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    sendSuccess(req, res, await useCase.delete(kindOf(req), requiredParam(req.params, 'id'), req.user.sub), 'Deleted.', 200);
  });

  const router = Router();
  // Per route, not router-wide: this router is mounted ahead of the level routers, whose reads other roles use.
  const admin = [authenticate(), requireRole('ADMIN'), validate({ params: territoryIdParamsSchema })];
  for (const segment of Object.keys(SEGMENTS)) {
    router.get(`/${segment}/:id/delete-impact`, ...admin, impact);
    router.delete(`/${segment}/:id`, ...admin, remove);
  }
  return router;
}
